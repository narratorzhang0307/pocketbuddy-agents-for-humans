FROM node:24-bookworm-slim AS build

WORKDIR /app
ARG VITE_MAP_PROVIDER=amap
ARG VITE_AMAP_KEY
ARG VITE_AMAP_SERVICE_HOST
ARG VITE_AMAP_SECURITY_JSCODE
ARG VITE_AMAP_STYLE=amap://styles/dark
ENV VITE_MAP_PROVIDER=$VITE_MAP_PROVIDER \
    VITE_AMAP_KEY=$VITE_AMAP_KEY \
    VITE_AMAP_SERVICE_HOST=$VITE_AMAP_SERVICE_HOST \
    VITE_AMAP_SECURITY_JSCODE=$VITE_AMAP_SECURITY_JSCODE \
    VITE_AMAP_STYLE=$VITE_AMAP_STYLE
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    API_HOST=0.0.0.0 \
    SPORTS_COACH_PYTHON=/opt/sports-venv/bin/python \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
# The same-origin sports endpoint executes the Python rules adapter.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/sports-venv
COPY vendor/sports-coach/deployment/requirements.txt /tmp/sports-requirements.txt
RUN /opt/sports-venv/bin/pip install --no-cache-dir -r /tmp/sports-requirements.txt
COPY deploy/all-things-agentic/runtime/package.json deploy/all-things-agentic/runtime/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --chown=node:node server.mjs ./server.mjs
COPY --chown=node:node server ./server
COPY --chown=node:node knowledge ./knowledge
COPY --chown=node:node vendor/sports-coach ./vendor/sports-coach
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "Promise.all(['/healthz','/api/sports-coach/health'].map(async p=>{const r=await fetch('http://127.0.0.1:8080'+p,{signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error(p);if(p.endsWith('/health')&&(await r.json()).ready!==true)throw Error(p)})).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
