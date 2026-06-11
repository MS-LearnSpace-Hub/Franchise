with open('report_routes.py', 'r') as f: content = f.read(); content = content.replace('\
branch\: s.branch,', '\branch\: s.branch,\n                \contact\: s.FatherPhone or s.phone or s.SmsNo or \-\,'); f = open('report_routes.py', 'w'); f.write(content); f.close()
