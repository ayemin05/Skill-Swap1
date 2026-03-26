#  Stage 1: Build
FROM golang:1.22-alpine AS builder

# gcc + musl-dev needed by go-sqlite3 (cgo)
RUN apk add --no-cache gcc musl-dev

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o skillswap .

#  Stage 2: Runtime
FROM alpine:3.19
RUN apk add --no-cache ca-certificates sqlite-libs

WORKDIR /app
COPY --from=builder /app/skillswap .
COPY static ./static

VOLUME ["/app/data"]
ENV PORT=8080
EXPOSE 8080
CMD ["./skillswap"]
