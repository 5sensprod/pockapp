# Build Node frontend
FROM node:23.0.0-alpine AS builder-node
WORKDIR /app
COPY . .
RUN npm i pnpm@9 -g && pnpm i
RUN pnpm i --frozen-lockfile --prod=false
RUN node --run build:client

# Build golang backend
FROM golang:1.23-alpine AS builder-golang
WORKDIR /app
COPY . .
COPY --from=builder-node /app/dist ./dist
RUN go mod download
RUN go build -tags production -o pocket-react

# Final stage
FROM alpine:latest
WORKDIR /pb

# Copy the built executable from builder stage
COPY --from=builder-golang /app/pocket-react /pb/pocket-react

# Copy hooks for module access control
COPY ./pb_hooks /pb/pb_hooks

# Create pb_data directory
RUN mkdir -p /pb/pb_data

EXPOSE 8090

# Run migrations
RUN /pb/pocket-react migrate history-sync || true
RUN /pb/pocket-react migrate up || true

# Start with proper flags
CMD ["/pb/pocket-react", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data"]
