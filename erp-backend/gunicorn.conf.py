workers = 4
threads = 4
timeout = 120

bind = "127.0.0.1:8001"

worker_class = "gthread"

max_requests = 1000
max_requests_jitter = 50

# Production logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
capture_output = True

# Performance options
preload_app = True
keepalive = 5