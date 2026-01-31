# Use the base ERPNext image
FROM frappe/erpnext:v15.94.3

# Switch to root
USER root

# Install HRMS by cloning and installing
RUN cd /home/frappe/frappe-bench/apps && \
    git clone --depth 1 --branch version-15 https://github.com/frappe/hrms && \
    cd /home/frappe/frappe-bench && \
    /home/frappe/frappe-bench/env/bin/pip install -e apps/hrms && \
    cd apps/hrms && yarn install && \
    cd /home/frappe/frappe-bench && \
    chown -R frappe:frappe /home/frappe/frappe-bench/apps/hrms && \
    ls -1 apps > sites/apps.txt

# Don't build assets here - will be built when site is created

# Set proper permissions
RUN chown -R frappe:frappe /home/frappe/frappe-bench

# Switch back to frappe user for runtime
USER frappe
