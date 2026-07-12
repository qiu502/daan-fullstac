# 答岸 · 容器镜像（适用于 Fly.io / VPS / 任意容器平台）
FROM node:22-slim

WORKDIR /app

# 先拷依赖清单，利用层缓存
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# 再拷源码
COPY . .

EXPOSE 3000

# 必须用 --experimental-sqlite 才能启用 Node 22 内置 SQLite
CMD ["node", "--experimental-sqlite", "server/index.js"]
