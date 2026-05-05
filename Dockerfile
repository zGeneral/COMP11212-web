# Dockerfile — produces the while-playground image (nginx:alpine + static SPA + Pyodide).
#
# Two-stage: stage 1 downloads and extracts the pinned Pyodide bundle so the
# final image doesn't carry the build tools. Final image is nginx:alpine + the
# SPA + pyodide assets.

# ---- Stage 1: fetch Pyodide ----
FROM alpine:3.20 AS pyodide-fetch
ARG PYODIDE_VERSION=0.27.0
RUN apk add --no-cache curl tar bzip2

WORKDIR /tmp
RUN curl -fsSL -o pyodide.tar.bz2 \
      "https://github.com/pyodide/pyodide/releases/download/${PYODIDE_VERSION}/pyodide-${PYODIDE_VERSION}.tar.bz2" \
 && tar -xjf pyodide.tar.bz2 \
 && rm pyodide.tar.bz2 \
 && mv pyodide /pyodide-bundle

# ---- Stage 2: bundle the CodeMirror editor ----
FROM node:20-alpine AS editor-build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY scripts/editor-entry.js scripts/build-editor.mjs ./scripts/
RUN mkdir -p static \
 && node scripts/build-editor.mjs
# Result: /build/static/editor-bundle.js (rebuilt fresh).

# ---- Stage 3: final image ----
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Copy the static SPA. .dockerignore keeps node_modules and tests out.
COPY index.html cheatsheets.html main.js engine.js editor.js trace_pane.js toolbar.js main.css embed.css ./
COPY static/while_lang.py ./static/
COPY static/lz-string.min.js ./static/
COPY static/examples.json ./static/
COPY static/wheels ./static/wheels
COPY static/cheatsheets ./static/cheatsheets

# Drop the Pyodide bundle in.
COPY --from=pyodide-fetch /pyodide-bundle ./static/pyodide

# Drop the freshly-built CodeMirror bundle in.
COPY --from=editor-build /build/static/editor-bundle.js ./static/editor-bundle.js

# Replace the default nginx config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Container listens on 80; Traefik handles TLS at the edge.
EXPOSE 80

# Use the default nginx CMD.
