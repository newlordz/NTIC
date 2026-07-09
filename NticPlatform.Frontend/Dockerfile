# Stage 1: Build Angular application
FROM node:20-alpine AS build
WORKDIR /app

# Copy package configuration
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy application source code
COPY . .

# Build the Angular app for production
RUN npm run build

# Stage 2: Serve with lightweight Nginx
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Remove default Nginx static files
RUN rm -rf ./*

# Copy built artifacts from Stage 1
COPY --from=build /app/dist/stem-frontend/browser .

# Copy custom Nginx SPA configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Railway provides $PORT environment variable dynamically
EXPOSE 8080

CMD ["sh", "-c", "PORT=${PORT:-8080} && sed -i \"s/listen  *.*/listen $PORT;/g\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
