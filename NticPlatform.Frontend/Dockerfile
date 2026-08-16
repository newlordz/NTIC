# Stage 1: Build Angular application
FROM node:20-alpine AS build
WORKDIR /app

# Copy package configuration
COPY package*.json ./
# `npm ci` honours package-lock.json exactly; `npm install` may resolve new
# versions and rewrite the lockfile, making builds non-reproducible.
RUN npm ci --no-audit --no-fund

# Copy application source code
COPY . .

# angular.json points the `development` configuration at environment.local.ts,
# which is gitignored and therefore absent here. Production builds do not use it,
# but create a stand-in so any tooling that resolves it does not fail.
RUN if [ ! -f src/environments/environment.local.ts ]; then \
      cp src/environments/environment.prod.ts src/environments/environment.local.ts; \
    fi

# Build the Angular app for production
RUN npm run build

# Stage 2: Serve with lightweight Nginx
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Remove default Nginx static files
RUN rm -rf ./*

# Copy built artifacts from Stage 1
COPY --from=build /app/dist/ntic-frontend/browser .

# Copy custom Nginx SPA configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Railway provides $PORT environment variable dynamically
EXPOSE 8080

# Health check so an orchestrator can tell a wedged container from a healthy one.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider "http://127.0.0.1:${PORT:-8080}/index.html" || exit 1

# BACKEND_URL points at the API (host:port, no scheme), e.g. "api.internal:5000".
# Substituted into the nginx config at start-up; /api/* is proxied there.
CMD ["sh", "-c", "\
PORT=${PORT:-8080} && \
BACKEND=${BACKEND_URL:-127.0.0.1:5000} && \
BACKEND=$(echo \"$BACKEND\" | sed -e 's#^https\\?://##' -e 's#/$##') && \
sed -i \"s/listen  *[0-9]*;/listen $PORT;/\" /etc/nginx/conf.d/default.conf && \
sed -i \"s#BACKEND_UPSTREAM_PLACEHOLDER#$BACKEND#\" /etc/nginx/conf.d/default.conf && \
nginx -t && \
exec nginx -g 'daemon off;'"]
