FROM node:20-alpine
WORKDIR /app

# [CRITICAL HACK] Install OpenSSL agar kompatibel dengan Prisma Query Engine di Alpine
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install
COPY prisma ./prisma/
RUN npx prisma generate
COPY . .

EXPOSE 5000
CMD ["npx", "ts-node", "src/server.ts"]
