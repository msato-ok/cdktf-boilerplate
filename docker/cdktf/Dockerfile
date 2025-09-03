FROM node:20-bullseye AS base

# Allow caller to override the runtime user/group via build args
ARG UID=1000
ARG GID=1000
ARG USERNAME=node
ARG GROUPNAME=node

# Expose selected build args as environment vars for later stages and runtime
ENV USER_UID=${UID}
ENV USER_GID=${GID}
ENV USER_NAME=${USERNAME}
ENV USER_GROUP=${GROUPNAME}

# Base image with common OS-level tools and user setup

# Install additional tools
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    sudo \
    git \
    curl \
    wget \
    unzip \
    jq \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install AWS CLI v2
RUN set -eux; \
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip; \
    unzip -q /tmp/awscliv2.zip -d /tmp; \
    /tmp/aws/install -i /usr/local/aws-cli -b /usr/local/bin || true; \
    rm -rf /tmp/aws /tmp/awscliv2.zip || true

# Install OpenTofu via official Debian repository
RUN set -eux; \
    install -m 0755 -d /etc/apt/keyrings; \
    curl -fsSL https://get.opentofu.org/opentofu.gpg | tee /etc/apt/keyrings/opentofu.gpg >/dev/null; \
    curl -fsSL https://packages.opentofu.org/opentofu/tofu/gpgkey | gpg --no-tty --batch --dearmor -o /etc/apt/keyrings/opentofu-repo.gpg; \
    chmod a+r /etc/apt/keyrings/opentofu.gpg /etc/apt/keyrings/opentofu-repo.gpg; \
    echo "deb [signed-by=/etc/apt/keyrings/opentofu.gpg,/etc/apt/keyrings/opentofu-repo.gpg] https://packages.opentofu.org/opentofu/tofu/any/ any main" | tee /etc/apt/sources.list.d/opentofu.list >/dev/null; \
    chmod a+r /etc/apt/sources.list.d/opentofu.list; \
    apt-get update && apt-get install -y tofu; \
    rm -rf /var/lib/apt/lists/*

# Create terraform symlink for CDKTF compatibility
RUN ln -sf /usr/bin/tofu /usr/bin/terraform

# Install TFLint
RUN curl -s https://raw.githubusercontent.com/terraform-linters/tflint/master/install_linux.sh | bash

# Install Google Cloud CLI (Required for personal account authentication)
RUN set -eux; \
    curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /etc/apt/keyrings/cloud.google.gpg; \
    echo "deb [signed-by=/etc/apt/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list; \
    apt-get update && apt-get install -y google-cloud-cli; \
    rm -rf /var/lib/apt/lists/*

# Create predictable user/group using build args (defaults: UID=1000, USERNAME=node)
RUN set -eux; \
    if getent group "$USER_GROUP" >/dev/null 2>&1; then \
    groupmod -g "$USER_GID" "$USER_GROUP" || true; \
    else \
    groupadd -g "$USER_GID" "$USER_GROUP" || true; \
    fi; \
    if id -u "$USER_NAME" >/dev/null 2>&1; then \
    usermod -u "$USER_UID" -g "$USER_GID" "$USER_NAME" || true; \
    else \
    useradd -m -u "$USER_UID" -g "$USER_GID" -s /bin/bash "$USER_NAME" || true; \
    fi; \
    mkdir -p "/home/$USER_NAME"; chown -R "$USER_UID:$USER_GID" "/home/$USER_NAME"; \
    echo "$USER_NAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/"$USER_NAME"; chmod 0440 /etc/sudoers.d/"$USER_NAME"

## Builder stage inherits from base so it has the same tools/user
FROM base AS builder

# Builder: use the configured user to run npm ci so node_modules are owned correctly
WORKDIR /build
COPY package*.json ./
RUN chown -R "$USER_UID:$USER_GID" /build || true
USER ${USER_NAME}
RUN npm ci --no-audit --no-fund
USER root

## Final stage also inherits from base, keeping common setup DRY
FROM base AS final

# Copy node_modules from builder so the final image contains /workspace/node_modules
RUN mkdir -p /workspace
# Preserve ownership: copy node_modules as the configured user/group
COPY --from=builder --chown=${USER_NAME}:${USER_GROUP} /build/node_modules /workspace/node_modules
WORKDIR /workspace

# Switch to configured user for runtime
USER ${USER_NAME}

