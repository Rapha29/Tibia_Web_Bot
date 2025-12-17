const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Caminho para os arquivos de dados e para a pasta de imagens
const BOSS_DATA_PATH = path.join(__dirname, 'boss_data.json');
const LOCAL_BOSS_DATA_PATH = path.join(__dirname, 'boss_data_local.json');
const IMG_DIR = path.join(__dirname, 'images', 'bosses');

// Função para garantir que o diretório de imagens exista
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

// Função principal
async function downloadBossImages() {
    console.log('Iniciando o processo de download das imagens dos bosses...');

    // 1. Cria o diretório de imagens se não existir
    if (!fs.existsSync(IMG_DIR)) {
        fs.mkdirSync(IMG_DIR, { recursive: true });
        console.log(`Diretório criado em: ${IMG_DIR}`);
    }

    // 2. Lê o arquivo de dados original
    if (!fs.existsSync(BOSS_DATA_PATH)) {
        console.error('ERRO: Arquivo boss_data.json não encontrado. Execute a etapa anterior primeiro.');
        return;
    }
    const bossData = JSON.parse(fs.readFileSync(BOSS_DATA_PATH, 'utf-8'));
    const allBosses = [...bossData.killedYesterday, ...bossData.bossList];
    const uniqueImageUrls = [...new Set(allBosses.map(b => b.imageUrl))];

    console.log(`Encontradas ${uniqueImageUrls.length} imagens únicas para baixar.`);

    // 3. Baixa cada imagem
    for (const url of uniqueImageUrls) {
        try {
            const filename = path.basename(url);
            const localPath = path.join(IMG_DIR, filename);

            if (fs.existsSync(localPath)) {
                console.log(`- Imagem '${filename}' já existe. Pulando.`);
                continue;
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Falha ao baixar ${url}: ${response.statusText}`);
            }

            const fileStream = fs.createWriteStream(localPath);
            await new Promise((resolve, reject) => {
                response.body.pipe(fileStream);
                response.body.on("error", reject);
                fileStream.on("finish", resolve);
            });

            console.log(`- Imagem '${filename}' baixada com sucesso.`);
        } catch (error) {
            console.error(`ERRO ao processar ${url}:`, error.message);
        }
    }

    console.log('Download de imagens concluído.');

    // 4. Cria o novo arquivo de dados com caminhos locais
    const newBossData = {
        killedYesterday: bossData.killedYesterday.map(boss => ({
            ...boss,
            imageUrl: `/images/bosses/${path.basename(boss.imageUrl)}`
        })),
        bossList: bossData.bossList.map(boss => ({
            ...boss,
            imageUrl: `/images/bosses/${path.basename(boss.imageUrl)}`
        }))
    };

    fs.writeFileSync(LOCAL_BOSS_DATA_PATH, JSON.stringify(newBossData, null, 2));
    console.log(`Arquivo 'boss_data_local.json' criado com os caminhos de imagem atualizados.`);
    console.log('\nProcesso finalizado com sucesso!');
}

downloadBossImages();