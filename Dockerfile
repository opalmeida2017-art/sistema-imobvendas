# Usa uma imagem leve do Python
FROM python:3.11-slim

# Define a pasta de trabalho dentro do container
WORKDIR /app

# Copia os arquivos do seu computador para o container
COPY . .

# Instala as bibliotecas
RUN pip install --no-cache-dir -r requirements.txt

# Comando para iniciar o site (usando FastAPI e Uvicorn)
CMD ["uvicorn", "main.py:app", "--host", "0.0.0.0", "--port", "80"]