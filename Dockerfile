# ---- Production Stage ----
FROM --platform=linux/amd64 nikolaik/python-nodejs:python3.9-nodejs20 as prod

WORKDIR /home/bdi-viz-react/

# Install runtime system dependencies only
RUN apt-get update && apt-get install -y \
    redis \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

COPY package.json ./
COPY pnpm-lock.yaml ./
RUN pnpm install --production

RUN groupadd --gid 1001 yfw215 && \
    useradd --uid 1001 --gid 1001 -m yfw215

# Copy files and set ownership in a single step to save space
COPY --chown=yfw215:yfw215 ./next.config.js ./next.config.js
COPY --chown=yfw215:yfw215 ./tsconfig.json ./tsconfig.json
COPY --chown=yfw215:yfw215 ./tailwind.config.ts ./tailwind.config.ts
COPY --chown=yfw215:yfw215 ./postcss.config.mjs ./postcss.config.mjs
COPY --chown=yfw215:yfw215 ./package.json ./package.json
COPY --chown=yfw215:yfw215 ./requirements.txt ./requirements.txt
COPY --chown=yfw215:yfw215 ./api ./api
COPY --chown=yfw215:yfw215 ./app ./app
# Add any other needed files/folders (e.g., fonts, if used by Next.js)
COPY --chown=yfw215:yfw215 ./app/fonts ./app/fonts

RUN pnpm run build && \
    pnpm store prune --force && \
    rm -rf /home/yfw215/.cache/* /tmp/* 

COPY --chown=yfw215:yfw215 .cache/bdikit /home/yfw215/.cache/bdikit
COPY --chown=yfw215:yfw215 .cache/huggingface /home/yfw215/.cache/huggingface
COPY --chown=yfw215:yfw215 .cache/magneto-gdc-v0.1 /home/bdi-viz-react/.cache/
COPY --chown=yfw215:yfw215 .cache/ontologies /home/bdi-viz-react/.cache/ontologies
COPY --chown=yfw215:yfw215 .cache/explanations /home/bdi-viz-react/.cache/explanations

# Create directories and set ownership for chroma db and redis cache
RUN mkdir -p /home/bdi-viz-react/api/sessions/default/chroma_db && chown -R yfw215:yfw215 /home/bdi-viz-react/api/sessions/default/chroma_db
RUN mkdir -p /home/bdi-viz-react/.cache/redis && chown -R yfw215:yfw215 /home/bdi-viz-react/.cache/redis

# Create celery log file
RUN touch /home/bdi-viz-react/celery.log && chown yfw215:yfw215 /home/bdi-viz-react/celery.log

USER yfw215

ENV NODE_ENV=production \
    PATH="${PATH}:/home/yfw215/.local/bin" \
    PYTHONPATH="${PYTHONPATH}:/home/yfw215/.local/bin" \
    HF_HOME="/home/yfw215/.cache/huggingface" \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    LLM_PROVIDER=portkey \
    DOCKER_ENV=hsrn

EXPOSE 3000

CMD ["pnpm", "run", "start"]