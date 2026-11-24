FROM node:22-alpine AS builder
EXPOSE 5173
WORKDIR /app
COPY package*.json ./
COPY . .
RUN npm install
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist /app/dist

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]
