import os
import json
import psycopg2
import hashlib
from datetime import datetime, date
from psycopg2.extras import RealDictCursor
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import google.generativeai as genai
from decimal import Decimal
from werkzeug.utils import secure_filename

# Carrega variáveis de ambiente
load_dotenv()

app = Flask(__name__)

UPLOAD_FOLDER = 'static/uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Configuração da IA
# Configuração da IA (Corrigido para google-generativeai)
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("ALERTA: GEMINI_API_KEY não encontrada")

# Forma correta de configurar o SDK clássico
genai.configure(api_key=api_key)
# Não usamos mais 'client = genai.Client'

# --- CONFIGURAÇÃO DO BANCO DE DADOS ---
def get_db_connection():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise Exception("DATABASE_URL não configurada no .env")
    return psycopg2.connect(db_url)

# --- CRIAÇÃO E MIGRAÇÃO DAS TABELAS ---
def setup_database():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. Tabela Principal (Com campo 'area' genérico)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS imoveis (
                id SERIAL PRIMARY KEY,
                titulo TEXT, preco NUMERIC, area NUMERIC, cidade TEXT, estado TEXT,
                status TEXT DEFAULT 'disponivel', url_foto TEXT, descricao TEXT,
                solo_pastagem TEXT, recursos_hidricos TEXT, infraestrutura TEXT,
                logistica TEXT, documentacao TEXT, operacao TEXT, pais TEXT,
                aptidao TEXT, servicos TEXT, vendedor TEXT, tipo TEXT
            )
        """)
        
        # 2. Tabelas Auxiliares
        cur.execute("""
            CREATE TABLE IF NOT EXISTS imoveis_fotos (
                id SERIAL PRIMARY KEY,
                imovel_id INTEGER REFERENCES imoveis(id) ON DELETE CASCADE,
                url_foto TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS opcoes_sistema (
                id SERIAL PRIMARY KEY,
                categoria TEXT, nome TEXT
            )
        """)
        
        # NOVA TABELA: Configurações do Site
        cur.execute("""
            CREATE TABLE IF NOT EXISTS configuracao (
                id SERIAL PRIMARY KEY,
                nome_site TEXT,
                url_logo TEXT
            )
        """)
        
        # --- ADICIONE ESTAS 3 LINHAS (GARANTIA DE COLUNAS) ---
        try:
            cur.execute("ALTER TABLE configuracao ADD COLUMN IF NOT EXISTS nome_site TEXT")
            cur.execute("ALTER TABLE configuracao ADD COLUMN IF NOT EXISTS url_logo TEXT")
            conn.commit()
        except: conn.rollback()
        # -----------------------------------------------------

        cur.execute("SELECT COUNT(*) FROM configuracao")
        if cur.fetchone()[0] == 0:
            cur.execute("INSERT INTO configuracao (nome_site, url_logo) VALUES ('AgroVendas', '')")
        
        conn.commit()
        
        cur.execute("CREATE TABLE IF NOT EXISTS usuarios (email TEXT PRIMARY KEY, senha_hash TEXT)")
        
        # Migração: Renomeia area_total_ha para area se necessário
        try:
            cur.execute("ALTER TABLE imoveis RENAME COLUMN area_total_ha TO area")
            conn.commit()
        except: conn.rollback()
            
        # Garante colunas novas
        cols = ["operacao", "pais", "aptidao", "servicos", "vendedor", "tipo", "area", "tipo_medida"]
        for c in cols:
            try:
                cur.execute(f"ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS {c} TEXT")
                conn.commit()
            except: conn.rollback()
            
        # Garante que area seja numérico
        try:
            cur.execute("ALTER TABLE imoveis ALTER COLUMN area TYPE NUMERIC USING area::numeric")
            conn.commit()
        except: conn.rollback()

        conn.commit()
        cur.close()
        conn.close()
        print("--- Banco Atualizado (Versão Final) ---")
    except Exception as e:
        print(f"Erro BD: {e}")

def hash_senha(senha):
    return hashlib.sha256(senha.encode()).hexdigest()

class CustomEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal): return float(o)
        if isinstance(o, (datetime, date)): return o.isoformat()
        return super(CustomEncoder, self).default(o)

# --- ROTAS DE API (GET) ---
@app.route('/api/imovel/<int:id>', methods=['GET'])
def get_imovel(id):
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM imoveis WHERE id = %s", (id,))
        imovel = cur.fetchone()
        
        if imovel:
            cur.execute("SELECT url_foto FROM imoveis_fotos WHERE imovel_id = %s", (id,))
            fotos_db = cur.fetchall()
            lista_fotos = [{'nome': f'Foto {i+1}', 'url': f['url_foto']} for i, f in enumerate(fotos_db)]
            if not lista_fotos and imovel['url_foto']:
                lista_fotos.append({'nome': 'Capa Principal', 'url': imovel['url_foto']})
            imovel['fotos'] = lista_fotos
            return json.dumps({"status": "sucesso", "dados": imovel}, cls=CustomEncoder)
        else:
            return jsonify({"status": "erro", "mensagem": "Não encontrado"})
    except Exception as e: return jsonify({"status": "erro", "mensagem": str(e)})
    finally:
        if 'conn' in locals(): conn.close()

# --- AUTENTICAÇÃO ---
@app.route('/auth/login', methods=['POST'])
def login_usuario():
    dados = request.json
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT email FROM usuarios WHERE email = %s AND senha_hash = %s", (dados.get('email'), hash_senha(dados.get('senha'))))
        user = cur.fetchone()
        if user: return jsonify({"status": "sucesso", "usuario": user[0]})
        else: return jsonify({"status": "erro", "mensagem": "Incorreto"})
    except Exception as e: return jsonify({"status": "erro", "mensagem": str(e)})

# --- ROTA HOME (ESTA ERA A QUE ESTAVA FALTANDO) ---
@app.route('/')
def home():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Busca Imóveis com ordenação personalizada:
    # 1. Status 'vendido' vai para o final (1), os outros ficam no topo (0)
    # 2. Depois ordena por ID decrescente (mais novos primeiro)
    cur.execute("""
        SELECT * FROM imoveis 
        ORDER BY 
            CASE WHEN status = 'vendido' THEN 1 ELSE 0 END ASC, 
            id DESC
    """)
    imoveis = cur.fetchall()
    
    # Busca Configuração
    cur.execute("SELECT * FROM configuracao LIMIT 1")
    config = cur.fetchone()
    
    conn.close()
    
    # Se não tiver config (segurança), cria um dict padrão
    if not config: config = {"nome_site": "AgroVendas", "url_logo": ""}
        
    return render_template('index.html', imoveis=imoveis, config=config)

@app.route('/imovel/<int:id>')
def ver_detalhe_imovel(id):
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Busca dados do imóvel
        cur.execute("SELECT * FROM imoveis WHERE id = %s", (id,))
        imovel = cur.fetchone()
        
        # Busca fotos
        cur.execute("SELECT url_foto FROM imoveis_fotos WHERE imovel_id = %s", (id,))
        fotos_db = cur.fetchall()
        
        # Prepara lista de fotos (Capa + Galeria)
        fotos = []
        if imovel['url_foto']:
            fotos.append(imovel['url_foto'])
        for f in fotos_db:
            fotos.append(f['url_foto'])
            
        # Busca configuração (Nome/Logo do site)
        cur.execute("SELECT * FROM configuracao LIMIT 1")
        config = cur.fetchone()
        if not config: config = {"nome_site": "AgroVendas", "url_logo": ""}

        conn.close()
        
        if not imovel:
            return "Imóvel não encontrado", 404

        return render_template('detalhe.html', imovel=imovel, fotos=fotos, config=config)
    except Exception as e:
        return f"Erro: {str(e)}"

# --- SALVAR IMÓVEL ---
@app.route('/api/imovel/salvar', methods=['POST'])
def salvar_imovel_direto():
    d = request.json
    try:
        preco = float(d.get('preco') or 0)
        area = float(d.get('area') or 0)
    except: preco, area = 0.0, 0.0

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        imovel_id = d.get('id')
        
        if imovel_id:
            # UPDATE (Adicionado tipo_medida)
            cur.execute("""
                UPDATE imoveis SET 
                    titulo=%s, preco=%s, area=%s, cidade=%s, estado=%s, 
                    descricao=%s, solo_pastagem=%s, recursos_hidricos=%s, infraestrutura=%s, 
                    logistica=%s, documentacao=%s, url_foto=%s, operacao=%s, 
                    pais=%s, aptidao=%s, servicos=%s, vendedor=%s, tipo=%s, tipo_medida=%s
                WHERE id=%s
            """, (
                d.get('titulo'), preco, area, d.get('cidade'), d.get('estado'),
                d.get('descricao'), d.get('solo_pastagem'), d.get('recursos_hidricos'), d.get('infraestrutura'),
                d.get('logistica'), d.get('documentacao'), d.get('url_foto'), d.get('operacao'),
                d.get('pais'), d.get('aptidao'), d.get('servicos'), d.get('vendedor'), d.get('tipo'), 
                d.get('tipo_medida'), # <--- NOVO
                imovel_id
            ))
        else:
            # INSERT (Adicionado tipo_medida)
            cur.execute("""
                INSERT INTO imoveis (
                    titulo, preco, area, cidade, estado, 
                    descricao, solo_pastagem, recursos_hidricos, infraestrutura, 
                    logistica, documentacao, url_foto, operacao, 
                    pais, aptidao, servicos, vendedor, tipo, tipo_medida
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                d.get('titulo'), preco, area, d.get('cidade'), d.get('estado'),
                d.get('descricao'), d.get('solo_pastagem'), d.get('recursos_hidricos'), d.get('infraestrutura'),
                d.get('logistica'), d.get('documentacao'), d.get('url_foto'), d.get('operacao'),
                d.get('pais'), d.get('aptidao'), d.get('servicos'), d.get('vendedor'), d.get('tipo'), 
                d.get('tipo_medida') # <--- NOVO
            ))
            imovel_id = cur.fetchone()[0]

        fotos = d.get('fotos', [])
        cur.execute("DELETE FROM imoveis_fotos WHERE imovel_id = %s", (imovel_id,))
        for foto in fotos:
            if foto.get('url'):
                cur.execute("INSERT INTO imoveis_fotos (imovel_id, url_foto) VALUES (%s, %s)", (imovel_id, foto.get('url')))

        conn.commit()
        return jsonify({"status": "sucesso", "mensagem": "Salvo com sucesso!"})

    except Exception as e:
        conn.rollback()
        return jsonify({"status": "erro", "detalhe": str(e)})
    finally:
        cur.close()
        conn.close()
        
# --- CHAT IA ---
@app.route('/chat', methods=['POST'])
def chat():
    dados = request.json
    comando_usuario = dados.get('comando')
    
    prompt = f"""
    Você é um interpretador de comandos SQL.
    COMANDO: "{comando_usuario}"
    REGRAS: Extraia TODOS os campos. 'area' refere-se ao tamanho total.
    Retorne JSON: {{ "acao": "CADASTRAR", "dados": {{...}} }}
    """

    try:
        response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        texto_limpo = response.text.strip().replace('```json', '').replace('```', '')
        dados_ia = json.loads(texto_limpo)
        
        acao = dados_ia.get('acao')
        conn = get_db_connection()
        cur = conn.cursor()

        if acao == 'CADASTRAR':
            d = dados_ia.get('dados')
            preco = float(d.get('preco') or 0)
            area = float(d.get('area') or 0)
            cur.execute("""
                INSERT INTO imoveis (titulo, preco, area, cidade, estado, descricao, solo_pastagem, recursos_hidricos, infraestrutura, logistica, documentacao, url_foto, operacao, pais, aptidao, servicos, vendedor, tipo)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (d.get('titulo'), preco, area, d.get('cidade'), d.get('estado'), d.get('descricao'), d.get('solo_pastagem'), d.get('recursos_hidricos'), d.get('infraestrutura'), d.get('logistica'), d.get('documentacao'), d.get('url_foto'), d.get('operacao'), d.get('pais'), d.get('aptidao'), d.get('servicos'), d.get('vendedor'), d.get('tipo')))
        
        elif acao == 'ATUALIZAR':
            d = dados_ia.get('dados')
            uid = dados_ia.get('id')
            preco = float(d.get('preco') or 0)
            area = float(d.get('area') or 0)
            cur.execute("""
                UPDATE imoveis SET titulo=%s, preco=%s, area=%s, cidade=%s, estado=%s, descricao=%s, solo_pastagem=%s, recursos_hidricos=%s, infraestrutura=%s, logistica=%s, documentacao=%s, url_foto=%s, operacao=%s, pais=%s, aptidao=%s, servicos=%s, vendedor=%s, tipo=%s
                WHERE id=%s
            """, (d.get('titulo'), preco, area, d.get('cidade'), d.get('estado'), d.get('descricao'), d.get('solo_pastagem'), d.get('recursos_hidricos'), d.get('infraestrutura'), d.get('logistica'), d.get('documentacao'), d.get('url_foto'), d.get('operacao'), d.get('pais'), d.get('aptidao'), d.get('servicos'), d.get('vendedor'), d.get('tipo'), uid))

        elif acao == 'VENDER': cur.execute("UPDATE imoveis SET status = 'vendido' WHERE id = %s", (dados_ia.get('id'),))
        elif acao == 'REMOVER': cur.execute("DELETE FROM imoveis WHERE id = %s", (dados_ia.get('id'),))

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"status": "sucesso", "operacao": acao})

    except Exception as e: return jsonify({"status": "erro", "detalhe": str(e)})

# --- OUTRAS ROTAS ---
@app.route('/api/imovel/vender/<int:id>', methods=['POST'])
def vender_direto(id):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE imoveis SET status = 'vendido' WHERE id = %s", (id,))
        conn.commit()
        return jsonify({"status": "sucesso"})
    except: return jsonify({"status": "erro"})
    finally: conn.close()

@app.route('/api/imovel/remover/<int:id>', methods=['DELETE'])
def remover_direto(id):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM imoveis WHERE id = %s", (id,))
        conn.commit()
        return jsonify({"status": "sucesso"})
    except: return jsonify({"status": "erro"})
    finally: conn.close()

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files: return jsonify({'erro': 'Erro'}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({'erro': 'Erro'}), 400
    if file:
        filename = secure_filename(file.filename)
        nome = f"{int(datetime.now().timestamp())}_{filename}"
        path = os.path.join(app.config['UPLOAD_FOLDER'], nome)
        file.save(path)
        return jsonify({'url': f"/{path.replace(os.sep, '/')}"})
    return jsonify({'erro': 'Erro'}), 500

@app.route('/api/opcoes', methods=['GET'])
def listar_opcoes():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM opcoes_sistema ORDER BY nome ASC")
        itens = cur.fetchall()
        res = {}
        for item in itens:
            cat = item['categoria']
            if cat not in res: res[cat] = []
            res[cat].append(item['nome'])
        return jsonify(res)
    except: return jsonify({})
    finally: conn.close()

@app.route('/api/opcoes/adicionar', methods=['POST'])
def adicionar_opcao():
    d = request.json
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM opcoes_sistema WHERE categoria=%s AND nome=%s", (d['categoria'], d['nome']))
        if cur.fetchone(): return jsonify({"status": "erro", "mensagem": "Já existe"})
        cur.execute("INSERT INTO opcoes_sistema (categoria, nome) VALUES (%s, %s)", (d['categoria'], d['nome']))
        conn.commit()
        return jsonify({"status": "sucesso"})
    except Exception as e: return jsonify({"status": "erro", "detalhe": str(e)})
    finally: conn.close()

@app.route('/agente/melhorar_texto', methods=['POST'])
def melhorar_texto():
    dados = request.json
    try:
        # Pega o título para dar contexto caso os outros campos estejam vazios
        titulo = dados.get('titulo', 'Imóvel Rural')
        
        prompt = f"""
        Você é um Copywriter Especialista em venda de Imovel, Terreno,Sitio,Fazenda,Casa.
        Seu objetivo é criar ou melhorar descrições para venda.
        
        DADOS DO IMÓVEL:
        - Título Principal: {titulo}
        - Descrição Atual: {dados.get('desc')}
        - Solo: {dados.get('solo')}
        - Hídrico: {dados.get('hidrico')}
        - Infraestrutura: {dados.get('infra')}
        - Logística: {dados.get('log')}
        - Documentação: {dados.get('doc')}
        
        REGRAS:
        1. Se o campo estiver vazio, CRIE um texto vendedor persuasivo baseando-se no Título "{titulo}".
        2. Se o campo já tiver texto, melhore a gramática e torne-o mais comercial.
        3. Use emojis moderadamente.
        4. Retorne APENAS um JSON puro, sem crases (```json).
        
        ESTRUTURA DE RESPOSTA (JSON):
        {{
            "desc_ia": "texto...",
            "solo_ia": "texto...",
            "hid_ia": "texto...",
            "infra_ia": "texto...",
            "log_ia": "texto...",
            "doc_ia": "texto..."
        }}
        """
        
        # Configuração para garantir JSON (funciona melhor no Gemini 1.5/2.0)
        generation_config = {"response_mime_type": "application/json"}
        
        response = client.models.generate_content(
            model="gemini-2.0-flash", 
            contents=prompt,
            config=generation_config
        )
        
        texto_limpo = response.text.strip()
        # Remove marcadores de código se a IA teimar em colocar
        if texto_limpo.startswith("```json"):
            texto_limpo = texto_limpo.replace("```json", "").replace("```", "")
            
        return jsonify(json.loads(texto_limpo))
        
    except Exception as e:
        print(f"Erro na IA: {e}")
        # Retorna o erro para o frontend ver
        return jsonify({"erro": str(e)})
    
@app.route('/api/config/salvar', methods=['POST'])
def salvar_config():
    d = request.json
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Atualiza a primeira linha (id=1 ou qualquer que exista)
        cur.execute("UPDATE configuracao SET nome_site=%s, url_logo=%s", (d.get('nome_site'), d.get('url_logo')))
        conn.commit()
        return jsonify({"status": "sucesso"})
    except Exception as e: return jsonify({"status": "erro", "detalhe": str(e)})
    finally: conn.close()
    
# --- ROTA TEMPORÁRIA PARA CRIAR ADMIN ---
@app.route('/criar-admin-agora')
def criar_admin_secreto():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Defina aqui seu usuário e senha
        email = "edson.fazendasmt@gmail.com"
        senha_plana = "123" 
        
        email = "op.almeida@hotmail.com"
        senha_plana = "123"
        
        # Criptografa a senha usando a função que já existe no seu código
        senha_criptografada = hash_senha(senha_plana)
        
        # Tenta inserir (se já existir, avisa)
        cur.execute("SELECT * FROM usuarios WHERE email = %s", (email,))
        if cur.fetchone():
            return "O usuário admin@agrovendas.com JÁ EXISTE no banco!"
            
        cur.execute("INSERT INTO usuarios (email, senha_hash) VALUES (%s, %s)", (email, senha_criptografada))
        conn.commit()
        conn.close()
        
        return f"✅ SUCESSO! Usuário criado.<br>Email: {email}<br>Senha: {senha_plana}"
    except Exception as e:
        return f"Erro: {str(e)}"
    
setup_database() 

if __name__ == '__main__':
    app.run(debug=True, port=5000)