import os,sys
sys.path.insert(0, os.getcwd())
from app import create_app
from models import User, Role, Permission, RolePermission
from helpers import get_user_permissions

app = create_app()
ctx = app.app_context()
ctx.push()

# Get a franchise admin user
user = User.query.filter_by(username='Franchise').first()
if user:
    print(f'Testing permissions for user: {user.username}')
    print(f'  role_id={user.role_id}, role_obj={user.role_obj}')
    print(f'  role_obj.is_active={user.role_obj.is_active if user.role_obj else None}')
    print()
    
    perms = get_user_permissions(user)
    print(f'Total permissions returned: {len(perms)}')
    print()
    
    # Count permissions by action
    read_count = sum(1 for p in perms.values() if p.get('can_read'))
    write_count = sum(1 for p in perms.values() if p.get('can_write'))
    append_count = sum(1 for p in perms.values() if p.get('can_append'))
    delete_count = sum(1 for p in perms.values() if p.get('can_delete'))
    
    print('Permission breakdown:')
    print(f'  can_read: {read_count}')
    print(f'  can_write: {write_count}')
    print(f'  can_append: {append_count}')
    print(f'  can_delete: {delete_count}')
    print()
    
    # Show admin permissions
    print('Admin-only permissions (not granted):')
    admin_perms = [p for p in perms.keys() if 'admin' in p.lower() or 'system' in p.lower()]
    for perm_code in admin_perms[:5]:
        perm = perms[perm_code]
        print(f'  {perm_code}: can_read={perm.get("can_read")}, can_write={perm.get("can_write")}')

ctx.pop()
