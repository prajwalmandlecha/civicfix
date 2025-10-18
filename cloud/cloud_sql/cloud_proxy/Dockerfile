FROM gcr.io/cloudsql-docker/gce-proxy:1.33.10

# Expose the port for PostgreSQL
EXPOSE 5433

# Start the proxy on container start
CMD ["/cloud_sql_proxy", "-instances=civicfix-474613:asia-south1:civicfix-database=tcp:0.0.0.0:5433"]