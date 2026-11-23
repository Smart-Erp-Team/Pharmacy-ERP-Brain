# Stage 1: Build the React + Vite application
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY apps/erp-frontend/package.json apps/erp-frontend/package-lock.json ./apps/erp-frontend/

# Install exact dependencies from lockfile
WORKDIR /app/apps/erp-frontend
RUN npm ci --legacy-peer-deps

# Copy shared contracts and frontend source code preserving monorepo structure
WORKDIR /app
COPY contracts ./contracts
COPY apps/erp-frontend ./apps/erp-frontend

# Run TypeScript check and Vite production build
WORKDIR /app/apps/erp-frontend
RUN npm run build

# Stage 2: Serve static files with Nginx
FROM nginx:alpine AS production

# Remove default Nginx static assets and config
RUN rm -rf /usr/share/nginx/html/*
COPY apps/erp-frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled output from the builder stage
COPY --from=builder /app/apps/erp-frontend/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
