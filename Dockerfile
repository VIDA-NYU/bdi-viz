FROM --platform=linux/amd64 nikolaik/python-nodejs:python3.9-nodejs20 as base

ADD . /home/bdi-viz-react/
WORKDIR /home/bdi-viz-react/
RUN apt-get update
RUN apt-get install -y vim

# Install dependencies based on the preferred package manager
RUN npm install concurrently
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm i; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

ENV NODE_ENV=development

RUN chmod -R 777 /home/bdi-viz-react/

RUN groupadd --gid 1001 yfw215
RUN useradd --uid 1001 --gid 1001 -m yfw215

# Copy cached model files if they exist
COPY --chown=yfw215:yfw215 .cache/ /home/yfw215/.cache/

USER yfw215

ENV PATH="${PATH}:/home/yfw215/.local/bin"
ENV PYTHONPATH="${PYTHONPATH}:/home/yfw215/.local/bin"

RUN pip install --user ipython

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "dev"]