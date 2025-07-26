# --- Base image for building ---
# ARG platform=linux/amd64

FROM --platform=linux/amd64 nikolaik/python-nodejs:python3.9-nodejs20 as builder

WORKDIR /home/bdi-viz-react/

# Install system dependencies needed for build
RUN apt-get update && apt-get install -y \
    vim \
    redis \
    && rm -rf /var/lib/apt/lists/*

# Copy only package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the Next.js app and install Python dependencies
RUN npm run build && \
    pip3 install -U pip && \
    pip3 install -r requirements.txt --break-system-packages

# --- Final image ---
FROM --platform=linux/amd64 nikolaik/python-nodejs:python3.9-nodejs20

WORKDIR /home/bdi-viz-react/

# Install runtime system dependencies only
RUN apt-get update && apt-get install -y \
    redis \
    && rm -rf /var/lib/apt/lists/*

# Create user
RUN groupadd --gid 1001 yfw215 && \
    useradd --uid 1001 --gid 1001 -m yfw215

# Copy only the built app and necessary files from builder
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/.next ./.next
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/public ./public
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/package*.json ./
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/requirements.txt ./
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/api ./api
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/app ./app
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/.source.csv ./
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/.target.csv ./
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/.source.json ./
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/.target.json ./
COPY --chown=yfw215:yfw215 --from=builder /home/bdi-viz-react/.env ./


# Install only production dependencies
RUN npm install --omit=dev && \
    pip3 install -U pip && \
    pip3 install -r requirements.txt --break-system-packages && \
    npm cache clean --force && \
    rm -rf /root/.cache /tmp/*

# Create cache directories with correct permissions
RUN mkdir -p /home/bdi-viz-react/.cache /home/yfw215/.cache && \
    chown -R yfw215:yfw215 /home/bdi-viz-react /home/yfw215

# Copy cached model files if they exist
COPY --chown=yfw215:yfw215 .cache/magneto-gdc-v0.1 /home/bdi-viz-react/.cache/
COPY --chown=yfw215:yfw215 .cache/bdikit /home/yfw215/.cache/bdikit
COPY --chown=yfw215:yfw215 .cache/huggingface /home/yfw215/.cache/huggingface

USER yfw215

ENV NODE_ENV=production \
    PATH="${PATH}:/home/yfw215/.local/bin" \
    PYTHONPATH="${PYTHONPATH}:/home/yfw215/.local/bin" \
    HF_HOME="/home/yfw215/.cache/huggingface" \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    LLM_PROVIDER=openai \
    DOCKER_ENV=hsrn

EXPOSE 3000

CMD ["npm", "run", "start"]