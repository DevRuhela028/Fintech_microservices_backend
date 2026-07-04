FROM node:22-alpine

WORKDIR /app

# Copy the monorepo root package files
COPY package*.json ./

# Install dependencies (no package-lock.json currently)
RUN npm install

# Copy everything
COPY . .

# Change to the service directory internally before building, actually for the previous user-service we stayed in /app and ran from there.
# Let's match the exact requested pattern:
# FROM node:22-alpine, WORKDIR /app, COPY package*.json, RUN npm ci --only=production, COPY . ., RUN npm run build, EXPOSE 3001, CMD ["node","dist/index.js"]

RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
