FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:vite
RUN cp -r src dist/Web/src \
	&& cp -r shared dist/Web/shared \
	&& cp -r node_modules dist/Web/node_modules \
	&& cp public/api.js dist/Web/api.js \
	&& cp Config.js dist/Web/Config.js \
	&& cp Config.local.js dist/Web/Config.local.js \
	&& cp version.json dist/Web/version.json
COPY entrypoint.sh /usr/local/bin/renewal-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/renewal-entrypoint \
	&& chmod +x /usr/local/bin/renewal-entrypoint

EXPOSE 3000
ENTRYPOINT ["renewal-entrypoint"]
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
