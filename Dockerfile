FROM oven/bun:latest

WORKDIR /app
COPY . .

RUN bun install --no-save
RUN bun run build

ENTRYPOINT [ "bun db:push", "&&", "./server" ]
