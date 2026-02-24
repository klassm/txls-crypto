FROM ghcr.io/klassm/txls-crypto:1.0.4

RUN apk add --no-cache jq

COPY run.sh /
COPY icon.png /
RUN chmod a+x /run.sh

EXPOSE 3000

CMD ["/run.sh"]
