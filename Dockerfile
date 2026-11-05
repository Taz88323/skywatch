FROM python:3.13-slim

# No packages to install: Skywatch only uses Python's standard library.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    SKYWATCH_HOST=0.0.0.0 \
    SKYWATCH_PORT=8080 \
    SKYWATCH_DATA=/data

WORKDIR /app
COPY server.py ./
COPY static ./static
COPY custom-aircraft ./custom-aircraft

# 568 is the "apps" user on TrueNAS, so files in /data are owned by the right account.
RUN mkdir /data && chown 568:568 /data
USER 568:568
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/settings', timeout=4)" || exit 1

CMD ["python", "server.py"]
