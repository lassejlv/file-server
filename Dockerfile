FROM oven/bun:latest

WORKDIR /app
COPY . .

RUN bun install --no-save
RUN bun run build
RUN bun db:push

ENTRYPOINT [ "./server" ]
