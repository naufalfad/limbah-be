FROM node:20-alpine
WORKDIR /app

# [CRITICAL HACK] Install OpenSSL & CA-Certificates agar koneksi HTTPS/TLS ke NASA EOSDIS valid di Alpine
RUN apk add --no-cache openssl ca-certificates curl

COPY package*.json ./
RUN npm install
COPY prisma ./prisma/
RUN npx prisma generate
COPY . .

EXPOSE 5000
CMD ["npx", "ts-node", "src/server.ts"]
