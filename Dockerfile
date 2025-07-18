FROM --platform=linux/amd64 nikolaik/python-nodejs:python3.9-nodejs20 as base

WORKDIR /home/bdi-viz-react/

# Install system dependencies in a single layer
RUN apt-get update && apt-get install -y \
    vim \
    redis \
    && rm -rf /var/lib/apt/lists/*

# Create user early to optimize layer caching
RUN groupadd --gid 1001 yfw215 && \
    useradd --uid 1001 --gid 1001 -m yfw215

# Copy only package files first to leverage Docker cache
COPY package*.json ./

# Install dependencies based on the preferred package manager in a single layer
RUN npm install concurrently && npm i

# Copy application code
COPY --chown=yfw215:yfw215 . .

# Build the application
RUN npm run build && \
    chmod -R 777 /home/bdi-viz-react/

# Copy cached model files if they exist
COPY --chown=yfw215:yfw215 .cache/ /home/yfw215/.cache/

USER yfw215

ENV NODE_ENV=development \
    PATH="${PATH}:/home/yfw215/.local/bin" \
    PYTHONPATH="${PYTHONPATH}:/home/yfw215/.local/bin" \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    LLM_PROVIDER=portkey \
    DOCKER_ENV=hsrn

RUN pip install --user ipython

EXPOSE 3000

CMD ["npm", "run", "start"]