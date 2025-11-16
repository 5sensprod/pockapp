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
WORKDIR /app

# Copy the built executable from builder stage
COPY --from=builder-golang /app/pocket-react /pb/pocket-react

# uncomment to copy the local pb_migrations dir into the image
# COPY ./pb_migrations /pb/pb_migrations

# 🆕 Copy hooks for module access control
COPY ./pb_hooks /pb/pb_hooks

EXPOSE 8090

RUN /pb/pocket-react migrate history-sync
RUN /pb/pocket-react migrate up

CMD ["/pb/pocket-react", "serve", "--http=0.0.0.0:8090"]
