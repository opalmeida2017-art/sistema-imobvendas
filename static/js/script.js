// --- VARIÁVEIS GLOBAIS ---
    let usuarioLogado = sessionStorage.getItem('usuario_agrovendas');
    let acaoAtual = ''; 
    let idEdicao = null;
    let fotosImovelUrls = []; 
    let opcoesSistema = {}; 
    let favoritos = JSON.parse(localStorage.getItem('imoveisFavoritos')) || [];

    // --- AO CARREGAR A PÁGINA ---
    document.addEventListener("DOMContentLoaded", function() {
        const painel = document.getElementById('painelPrincipal');
        if (painel) { painel.classList.remove('hidden'); painel.style.opacity = '1'; }

        if (usuarioLogado) {
            atualizarInterfaceLogado(usuarioLogado);
        } else {
            const login = document.getElementById('telaLogin');
            if(login) login.classList.add('hidden');
        }

        // Carrega opções e favoritos
        carregarTodasOpcoes();
        aplicarFavoritosVisuais();
        ordenarCardsPorFavorito();
    });

    // --- 1. LÓGICA DE LOGIN ---
    function atualizarInterfaceLogado(nomeUsuario) {
        const btnEntrar = document.getElementById('btnEntrarNav');
        if (btnEntrar) btnEntrar.classList.add('hidden');

        const areaLogado = document.getElementById('areaUsuarioLogado');
        if (areaLogado) areaLogado.classList.remove('hidden');

        if(document.getElementById('labelUsuario')) document.getElementById('labelUsuario').innerText = "Olá, " + nomeUsuario;
        if(document.getElementById('emailNoMenu')) document.getElementById('emailNoMenu').innerText = nomeUsuario;
        if(document.getElementById('blocoComandoIA')) document.getElementById('blocoComandoIA').classList.remove('hidden');
        
        const login = document.getElementById('telaLogin');
        if(login) login.classList.add('hidden');
    }

    function abrirTelaLogin() { document.getElementById('telaLogin').classList.remove('hidden'); }
    function fecharTelaLogin() { document.getElementById('telaLogin').classList.add('hidden'); }
    function fecharLoginSeClicarFora(e) { if(e.target === e.currentTarget) fecharTelaLogin(); }

    async function fazerLogin() {
        const email = document.getElementById('login_email').value;
        const senha = document.getElementById('login_senha').value;
        if(!email || !senha) return alert("Preencha tudo!");

        try {
            const response = await fetch('/auth/login', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, senha })
            });
            const data = await response.json();
            if(data.status === "sucesso") {
                usuarioLogado = data.usuario;
                sessionStorage.setItem('usuario_agrovendas', data.usuario);
                atualizarInterfaceLogado(data.usuario);
                fecharTelaLogin();
            } else { alert("Erro: " + data.mensagem); }
        } catch(e) { alert("Erro de conexão."); }
    }

    function sairDoSistema() { 
        if(confirm("Sair do modo administrador?")) {
            sessionStorage.removeItem('usuario_agrovendas');
            location.reload(); 
        }
    }

    function gerenciarCliqueAvatar() {
        if (usuarioLogado) { document.getElementById('menuUsuarioDropdown').classList.toggle('hidden'); } 
        else { abrirTelaLogin(); }
    }

    window.onclick = function(event) {
        if (!event.target.matches('button') && !event.target.matches('button *')) {
            const menu = document.getElementById('menuUsuarioDropdown');
            if (menu && !menu.classList.contains('hidden')) { menu.classList.add('hidden'); }
        }
    }

    // --- 2. FAVORITOS E COMPARTILHAMENTO ---
    function compartilharImovel(url) {
        navigator.clipboard.writeText(url).then(() => {
            alert("Link copiado para a área de transferência! 📋");
        }).catch(err => {
            console.error('Erro ao copiar', err);
            prompt("Copie o link manualmente:", url);
        });
    }

    function favoritarImovel(id, btn) {
        const index = favoritos.indexOf(id);
        const icon = btn.querySelector('svg');
        
        if (index === -1) {
            favoritos.unshift(id); 
            icon.setAttribute('fill', 'currentColor');
            icon.classList.add('text-red-500');
            icon.classList.remove('text-gray-400');
        } else {
            favoritos.splice(index, 1);
            icon.setAttribute('fill', 'none');
            icon.classList.remove('text-red-500');
            icon.classList.add('text-gray-400');
        }
        
        localStorage.setItem('imoveisFavoritos', JSON.stringify(favoritos));
        ordenarCardsPorFavorito();
    }

    function aplicarFavoritosVisuais() {
        document.querySelectorAll('.imovel-card').forEach(card => {
            const id = parseInt(card.getAttribute('data-id'));
            if (favoritos.includes(id)) {
                const btn = card.querySelector('.btn-favorito svg');
                if(btn) {
                    btn.setAttribute('fill', 'currentColor');
                    btn.classList.add('text-red-500');
                    btn.classList.remove('text-gray-400');
                }
            }
        });
    }

    function ordenarCardsPorFavorito() {
        const container = document.getElementById('gridImoveis');; 
        if(!container) return;

        const cards = Array.from(document.querySelectorAll('.imovel-card'));
        
        cards.sort((a, b) => {
            const idA = parseInt(a.getAttribute('data-id'));
            const idB = parseInt(b.getAttribute('data-id'));
            
            const indexA = favoritos.indexOf(idA);
            const indexB = favoritos.indexOf(idB);
            
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0; 
        });
        
        cards.forEach(card => container.appendChild(card));
    }

    // --- 3. CRUD IMÓVEIS ---
    function iniciarCadastro() {
        idEdicao = null; 
        limparFormulario(false); 
        abrirModalCadastro();
        const titulo = document.querySelector('#modalCadastro h2');
        if(titulo) titulo.innerText = "Cadastrar Novo Imóvel";
    }

    function solicitarId(acao) {
        acaoAtual = acao;
        const input = document.getElementById('inputImovelId');
        if(input) {
            input.value = "";
            const titulos = {'alterar': '✏️ Alterar', 'remover': '🗑️ Remover', 'vendido': '🤝 Marcar Vendido'};
            if(document.getElementById('tituloModalId')) document.getElementById('tituloModalId').innerText = titulos[acao] + " (ID)";
            document.getElementById('modalId').classList.remove('hidden');
            input.focus();
        }
    }

    async function confirmarAcaoId() {
        const id = document.getElementById('inputImovelId').value;
        if (!id) return alert("Digite um ID válido!");
        document.getElementById('modalId').classList.add('hidden');

        if (acaoAtual === 'alterar') {
            carregarDadosParaEdicao(id);
        } else if (acaoAtual === 'remover') {
            if(confirm(`Tem certeza que deseja DELETAR o imóvel ${id}?`)) {
                try {
                    const res = await fetch(`/api/imovel/remover/${id}`, {method: 'DELETE'});
                    const json = await res.json();
                    if(json.status === 'sucesso') location.reload(); 
                    else alert("Erro: " + json.detalhe);
                } catch(e) { alert("Erro conexão."); }
            }
        } else if (acaoAtual === 'vendido') {
            try {
                const res = await fetch(`/api/imovel/vender/${id}`, {method: 'POST'});
                const json = await res.json();
                if(json.status === 'sucesso') location.reload(); 
                else alert("Erro: " + json.detalhe);
            } catch(e) { alert("Erro conexão."); }
        }
    }

    async function carregarDadosParaEdicao(id) {
        try {
            const res = await fetch(`/api/imovel/${id}`);
            const json = await res.json();
            
            if (json.status === 'sucesso') {
                const dados = json.dados;
                idEdicao = id;
                
                const setValue = (id, val) => { if(document.getElementById(id)) document.getElementById(id).value = val || ""; }
                
                setValue('f_titulo', dados.titulo);
                setValue('f_operacao', dados.operacao || "Venda");
                setSelectValue('f_pais', dados.pais || "Brasil");
                setSelectValue('f_tipo', dados.tipo); 
                setSelectValue('f_medida', dados.tipo_medida);

                let local = dados.cidade || "";
                if (dados.estado) local += " - " + dados.estado;
                setSelectValue('f_cidade_estado', local);

                setValue('f_preco_hectare', dados.preco); 
                setValue('f_area', dados.area);
                
                setSelectValue('f_aptidao', dados.aptidao);
                setSelectValue('f_servicos', dados.servicos);
                setSelectValue('f_vendedor', dados.vendedor);
                
                setValue('f_desc', dados.descricao);
                setValue('f_solo', dados.solo_pastagem);
                setValue('f_hidrico', dados.recursos_hidricos);
                setValue('f_infra', dados.infraestrutura);
                setValue('f_log', dados.logistica);
                setValue('f_doc', dados.documentacao);
                setValue('f_foto', dados.url_foto);
                
                fotosImovelUrls = dados.fotos || [];
                if (fotosImovelUrls.length === 0 && dados.url_foto) {
                    fotosImovelUrls.push({nome: 'Capa Principal', url: dados.url_foto});
                }
                renderizarListaFotos();

                abrirModalCadastro();
                document.querySelector('#modalCadastro h2').innerText = `Editando Imóvel ID: ${id}`;
            } else { alert("Não encontrado."); }
        } catch (e) { alert("Erro ao buscar."); console.error(e); }
    }

    async function salvarTudo() {
        const btn = document.querySelector('button[onclick="salvarTudo()"]');
        const textoOriginal = btn.innerText;
        btn.innerText = "💾 Salvando..."; btn.disabled = true;

        try {
            const titulo = document.getElementById('f_titulo').value;
            const precoTotal = parseFloat(document.getElementById('f_preco_hectare').value) || 0; 
            const area = parseFloat(document.getElementById('f_area').value) || 0;
            
            let cidadeFull = document.getElementById('f_cidade_estado').value;
            let cidade = cidadeFull; let estado = "";
            if (cidadeFull.includes("-")) { 
                const parts = cidadeFull.split("-"); cidade = parts[0].trim(); estado = parts[1].trim(); 
            }

            const payload = {
                id: idEdicao, titulo: titulo, preco: precoTotal, area: area,
                operacao: document.getElementById('f_operacao').value,
                pais: document.getElementById('f_pais').value, cidade: cidade, estado: estado,
                aptidao: document.getElementById('f_aptidao').value,
                servicos: document.getElementById('f_servicos').value,
                vendedor: document.getElementById('f_vendedor').value,
                tipo: document.getElementById('f_tipo').value,
                tipo_medida: document.getElementById('f_medida').value,
                descricao: document.getElementById('f_desc').value,
                solo_pastagem: document.getElementById('f_solo').value,
                recursos_hidricos: document.getElementById('f_hidrico').value,
                infraestrutura: document.getElementById('f_infra').value,
                logistica: document.getElementById('f_log').value,
                documentacao: document.getElementById('f_doc').value,
                url_foto: document.getElementById('f_foto').value,
                fotos: fotosImovelUrls 
            };

            const res = await fetch('/api/imovel/salvar', { 
                method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) 
            });
            const json = await res.json();
            if(json.status === 'sucesso') { location.reload(); } 
            else { alert("Erro: " + json.detalhe); btn.innerText = textoOriginal; btn.disabled = false; }
        } catch(e) { console.error(e); alert("Erro conexão."); btn.innerText = textoOriginal; btn.disabled = false; }
    }

    // --- 4. FUNÇÕES DE SISTEMA (COMBOS) ---
    async function carregarTodasOpcoes() {
        try {
            const res = await fetch('/api/opcoes');
            if (res.ok) {
                opcoesSistema = await res.json();
                preencherSelect('f_tipo', opcoesSistema['tipo']);
                preencherSelect('f_pais', opcoesSistema['pais']);
                preencherSelect('f_cidade_estado', opcoesSistema['cidade']);
                preencherSelect('f_aptidao', opcoesSistema['aptidao']);
                preencherSelect('f_servicos', opcoesSistema['servicos']);
                preencherSelect('f_vendedor', opcoesSistema['vendedor']);
            }
        } catch(e) { console.error("Erro ao carregar opções", e); }
    }

    function preencherSelect(idSelect, listaOpcoes) {
        const select = document.getElementById(idSelect);
        if(!select) return;
        const valorAtual = select.value;
        select.innerHTML = '';
        
        if(idSelect !== 'f_pais' && idSelect !== 'f_vendedor') {
            const optPadrao = document.createElement('option');
            optPadrao.value = ""; optPadrao.innerText = "Selecione..."; select.appendChild(optPadrao);
        } else if (idSelect === 'f_pais') {
            if(!listaOpcoes || listaOpcoes.length === 0) {
                const opt = document.createElement('option'); opt.value="Brasil"; opt.innerText="Brasil"; select.appendChild(opt);
            }
        }

        if(listaOpcoes && listaOpcoes.length > 0) {
            listaOpcoes.forEach(op => {
                const option = document.createElement('option');
                option.value = op; option.innerText = op; select.appendChild(option);
            });
        }
        if(valorAtual) setSelectValue(idSelect, valorAtual);
    }

    async function novaOpcao(categoria, idSelect) {
        const novoValor = prompt(`Digite o novo valor para ${categoria}:`);
        if(!novoValor) return;
        try {
            const res = await fetch('/api/opcoes/adicionar', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ categoria: categoria, nome: novoValor })
            });
            const json = await res.json();
            if(json.status === 'sucesso') {
                const select = document.getElementById(idSelect);
                const option = document.createElement('option');
                option.value = novoValor; option.innerText = novoValor; option.selected = true; 
                select.appendChild(option);
                if(!opcoesSistema[categoria]) opcoesSistema[categoria] = [];
                opcoesSistema[categoria].push(novoValor);
            } else { alert("Erro: " + json.mensagem); }
        } catch(e) { alert("Erro de conexão"); }
    }

    function setSelectValue(id, valor) {
        const select = document.getElementById(id);
        if (!select) return;
        if (!valor) { select.value = ""; return; }
        let existe = false;
        for (let i = 0; i < select.options.length; i++) { if (select.options[i].value == valor) { existe = true; break; } }
        if (!existe) {
            const opt = document.createElement('option');
            opt.value = valor; opt.innerText = valor; select.appendChild(opt);
        }
        select.value = valor;
    }

    // --- 5. FUNÇÕES AUXILIARES MODAL ---
    function abrirModalCadastro() { document.getElementById('modalCadastro').classList.remove('hidden'); document.body.classList.add('modal-open'); }
    function fecharModal() { document.getElementById('modalCadastro').classList.add('hidden'); document.body.classList.remove('modal-open'); }
    function proximaEtapa() { document.getElementById('etapa1').classList.add('hidden'); document.getElementById('etapa2').classList.remove('hidden'); }
    function voltarEtapa() { document.getElementById('etapa2').classList.add('hidden'); document.getElementById('etapa1').classList.remove('hidden'); }
    function limparFormulario(confirmar=true) {
        if(!confirmar || confirm("Limpar formulário?")) { 
            document.querySelectorAll('#modalCadastro input, #modalCadastro textarea').forEach(i=>i.value=""); 
            fotosImovelUrls = [];
            renderizarListaFotos();
            voltarEtapa(); 
        }
    }

    // --- 6. IA REFINADORA ---
    async function melhorarComIA() {
        const btn = document.getElementById('btnIA'); 
        const textoOriginal = btn.innerText;
        btn.innerText = "✨ IA Trabalhando..."; btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');

        const dados = { 
            titulo: document.getElementById('f_titulo').value || "Imóvel Rural",
            desc: document.getElementById('f_desc').value,
            solo: document.getElementById('f_solo').value,
            hidrico: document.getElementById('f_hidrico').value,
            infra: document.getElementById('f_infra').value,
            log: document.getElementById('f_log').value,
            doc: document.getElementById('f_doc').value
        };

        try {
            const res = await fetch('/agente/melhorar_texto', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(dados) });
            const json = await res.json();
            if (json.erro) { alert("Erro na IA: " + json.erro); } 
            else {
                if(json.desc_ia) document.getElementById('f_desc').value = json.desc_ia;
                if(json.solo_ia) document.getElementById('f_solo').value = json.solo_ia;
                if(json.hid_ia) document.getElementById('f_hidrico').value = json.hid_ia;
                if(json.infra_ia) document.getElementById('f_infra').value = json.infra_ia;
                if(json.log_ia) document.getElementById('f_log').value = json.log_ia;
                if(json.doc_ia) document.getElementById('f_doc').value = json.doc_ia;
                btn.innerText = "✅ Texto Gerado!";
            }
        } catch(e) { console.error(e); alert("Erro IA"); } 
        finally { 
            setTimeout(() => { 
                btn.innerText = textoOriginal; 
                btn.disabled = false; 
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }, 2000); 
        }
    }

    // --- 7. UPLOAD E FOTOS ---
    async function fazerUploadImagem() {
        const input = document.getElementById('inputArquivoEscondido');
        const btnTrigger = document.getElementById('btnUploadTrigger');
        if (!input || !input.files || input.files.length === 0) return;
        const textoOriginal = btnTrigger.innerHTML;
        btnTrigger.innerHTML = "⏳ Enviando..."; btnTrigger.disabled = true;

        const uploadPromises = Array.from(input.files).map(file => {
            const formData = new FormData(); formData.append('file', file);
            return fetch('/upload', { method: 'POST', body: formData }).then(res => res.json()).then(data => {
                if (data.url) { return { nome: file.name, url: data.url }; } else { throw new Error(`Erro ${file.name}`); }
            });
        });

        try {
            const novosArquivos = await Promise.all(uploadPromises);
            fotosImovelUrls = [...fotosImovelUrls, ...novosArquivos];
            if (fotosImovelUrls.length > 0 && document.getElementById('f_foto').value === "") {
                document.getElementById('f_foto').value = fotosImovelUrls[0].url;
            }
            renderizarListaFotos();
            btnTrigger.innerHTML = "✅ Sucesso!";
            setTimeout(() => { btnTrigger.innerHTML = textoOriginal; btnTrigger.disabled = false; input.value = ""; }, 2000);
        } catch (error) { console.error(error); alert('Erro no upload.'); btnTrigger.innerHTML = textoOriginal; btnTrigger.disabled = false; }
    }

    function renderizarListaFotos() {
        const container = document.getElementById('listaFotosUpload');
        if (!container) return; 
        container.innerHTML = ''; 
        if (!fotosImovelUrls || fotosImovelUrls.length === 0) { container.innerHTML = '<p class="text-xs text-gray-400 italic text-center p-2">Nenhuma foto.</p>'; return; }

        fotosImovelUrls.forEach((foto, index) => {
            let nomeExibicao = foto.nome || (foto.url ? foto.url.split('/').pop() : `Foto ${index + 1}`);
            const item = document.createElement('div');
            item.className = 'flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-200 shadow-sm mt-1';
            
            const img = document.createElement('img');
            img.src = foto.url; img.className = "w-12 h-12 object-cover rounded-md border border-gray-300";
            
            const nomeSpan = document.createElement('span');
            nomeSpan.className = 'flex-1 text-sm text-gray-700 truncate font-medium';
            nomeSpan.innerText = nomeExibicao;
            
            const btnRemover = document.createElement('button');
            btnRemover.innerHTML = '🗑️';
            btnRemover.className = 'text-gray-400 hover:text-red-600 px-3 py-1 transition font-bold text-lg';
            btnRemover.type = "button"; 
            btnRemover.onclick = function(e) { e.preventDefault(); e.stopPropagation(); removerFoto(index); };

            item.appendChild(img); item.appendChild(nomeSpan); item.appendChild(btnRemover);
            container.appendChild(item);
        });
    }

    function removerFoto(index) {
        fotosImovelUrls.splice(index, 1);
        const inputCapa = document.getElementById('f_foto');
        if (fotosImovelUrls.length === 0) { if(inputCapa) inputCapa.value = ""; } 
        else { if(inputCapa && inputCapa.value === "") { inputCapa.value = fotosImovelUrls[0].url; } }
        renderizarListaFotos();
    }

    // --- 8. CONFIGURAÇÃO SITE ---
    function abrirModalConfig() { document.getElementById('modalConfig').classList.remove('hidden'); }
    async function fazerUploadLogo() {
        const input = document.getElementById('inputLogoUpload');
        const btn = document.getElementById('btnLogoUpload');
        if (!input.files || input.files.length === 0) return;
        const originalText = btn.innerText; btn.innerText = "⏳ Enviando..."; btn.disabled = true;
        const formData = new FormData(); formData.append('file', input.files[0]);
        try {
            const res = await fetch('/upload', { method: 'POST', body: formData });
            const json = await res.json();
            if (json.url) {
                document.getElementById('conf_url_logo').value = json.url;
                document.getElementById('previewLogo').src = json.url;
                document.getElementById('previewLogo').classList.remove('hidden');
                btn.innerText = "✅ Sucesso!";
            } else { alert("Erro no upload"); }
        } catch (e) { alert("Erro de conexão"); }
        finally { setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 2000); }
    }

    async function salvarConfiguracao() {
        const nome = document.getElementById('conf_nome').value;
        const url = document.getElementById('conf_url_logo').value;
        const telefone = document.getElementById('conf_telefone').value; // NOVO CAMPO
        
        if(!nome) return alert("O nome do site é obrigatório.");

        const btn = document.querySelector('button[onclick="salvarConfiguracao()"]');
        const textoOriginal = btn.innerText;
        btn.innerText = "💾 Salvando...";
        btn.disabled = true;

        try {
            const res = await fetch('/api/config/salvar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                // Envia o telefone também
                body: JSON.stringify({ nome_site: nome, url_logo: url, telefone: telefone })
            });
            
            const json = await res.json();
            
            if(json.status === 'sucesso') {
                alert("Configuração salva com sucesso!");
                location.reload();
            } else {
                alert("Erro ao salvar: " + (json.detalhe || "Erro desconhecido"));
            }
        } catch(e) { 
            console.error(e);
            alert("Erro de conexão."); 
        } finally {
            btn.innerText = textoOriginal;
            btn.disabled = false;
        }
    }

async function fazerUploadLogo() {
    const input = document.getElementById('inputLogoUpload');
    const preview = document.getElementById('previewLogo');
    const inputOculto = document.getElementById('conf_url_logo');
    
    if (input.files && input.files[0]) {
        const arquivo = input.files[0];
        const formData = new FormData();
        formData.append('file', arquivo);
        
        // Mostra que está carregando
        preview.classList.remove('hidden');
        preview.style.opacity = '0.5';

        try {
            const res = await fetch('/api/upload/logo', {
                method: 'POST',
                body: formData
            });
            const json = await res.json();
            
            if (json.url) {
                // Sucesso: Atualiza a foto na tela e prepara para salvar
                preview.src = json.url;
                preview.style.opacity = '1';
                inputOculto.value = json.url; // Guarda o link novo para quando clicar em "Salvar"
            } else {
                alert('Erro ao enviar imagem');
            }
        } catch (error) {
            console.error(error);
            alert('Erro na conexão com o servidor');
        }
    }
}