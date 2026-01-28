import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

# Tenta conectar usando o padrão mais estável
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

try:
    print("Testando conexão com o Gemini...")
    response = client.models.generate_content(
        model="gemini-1.5-flash-001",
        contents="Olá! Se você está lendo isso, a conexão funcionou."
    )
    print("-" * 30)
    print("RESPOSTA DA IA:", response.text)
    print("-" * 30)
    print("SUCESSO: Sua API Key e o modelo estão configurados corretamente!")

except Exception as e:
    print("-" * 30)
    print("ERRO DETALHADO:")
    print(e)
    print("-" * 30)
    print("DICA: Se aparecer 404, tente trocar o nome do modelo para 'gemini-1.5-flash-latest'")