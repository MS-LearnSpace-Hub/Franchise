import os
import ast
import sys

stdlib = getattr(sys, 'stdlib_module_names', set())
# fallback for older pythons
if not stdlib:
    import distutils.sysconfig as sysconfig
    std_lib_dir = sysconfig.get_python_lib(standard_lib=True)
    stdlib = {name.split('.')[0] for name in os.listdir(std_lib_dir)}

imports = set()

for root, dirs, files in os.walk('.'):
    if 'venv' in dirs:
        dirs.remove('venv')
    if '__pycache__' in dirs:
        dirs.remove('__pycache__')
    if 'logs' in dirs:
        dirs.remove('logs')
    if 'migrations' in dirs:
        dirs.remove('migrations')
    if 'scripts' in dirs:
        dirs.remove('scripts')
    
    for file in files:
        if file.endswith('.py') and file != 'find_imports.py':
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                try:
                    tree = ast.parse(f.read())
                    for node in ast.walk(tree):
                        if isinstance(node, ast.Import):
                            for alias in node.names:
                                imports.add(alias.name.split('.')[0])
                        elif isinstance(node, ast.ImportFrom):
                            # skip relative imports
                            if node.level == 0 and node.module:
                                imports.add(node.module.split('.')[0])
                except Exception as e:
                    pass

third_party = set()
for imp in imports:
    if imp not in stdlib and not imp.startswith('.'):
        # Filter local modules
        if not os.path.exists(os.path.join('.', imp + '.py')) and not os.path.exists(os.path.join('.', imp, '__init__.py')) and not os.path.exists(os.path.join('.', imp)):
            third_party.add(imp)

print("Third party imports found:")
for imp in sorted(third_party):
    print(imp)
