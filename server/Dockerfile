FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./
COPY public ./public
ENV PORT=8196 DATA_FILE=/data/state.json
RUN mkdir /data && chown node /data
VOLUME /data
EXPOSE 8196
USER node
CMD ["node", "server.mjs"]
