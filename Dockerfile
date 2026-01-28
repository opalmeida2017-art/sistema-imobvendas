# Usa uma imagem oficial do Python
FROM python:3.11-slim

# Define a pasta de trabalho dentro do servidor
WORKDIR /app

# Copia os arquivos do seu GitHub para dentro do servidor
COPY . .

# Executa a instalação das bibliotecas (equivalente ao pip install)
RUN pip install --no-cache-dir -r requirements.txt

# Comando para iniciar o sistema (equivalente ao Start Command)
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "main:app"]