FROM postgres:16

# Install pgmq (Postgres message queue extension) from Tembo apt repo
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    curl \
    gnupg2 \
    && curl -fsSL https://packages.tembo.io/tembo-gpg-key.asc \
       | gpg --dearmor -o /usr/share/keyrings/tembo-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/tembo-keyring.gpg] https://packages.tembo.io/apt stable main" \
       > /etc/apt/sources.list.d/tembo.list \
    && apt-get update -qq \
    && apt-get install -y postgresql-16-pgmq \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
