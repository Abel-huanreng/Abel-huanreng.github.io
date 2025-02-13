const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// 配置类
class Config {
    static BULLET_A_SPEED = 3; // 子弹A的速度
    static BULLET_B_SPEED = -5; // 子弹B的速度
    static BULLET_A_SIZE = { width: 50, height: 60 }; // 子弹A的大小
    static BULLET_B_SIZE = { width: 30, height: 40 }; // 子弹B的大小
    static BULLET_A_IMAGE = '../img/2024/11/14/dog.png'; // 子弹A的图片地址
    static BULLET_B_IMAGE = '../img/2025/2/13/wDog.png'; // 子弹B的图片地址

    static PLAYER_IMAGE = '../img/2025/2/13/feichuan.png'; // 飞船的图片地址
    static PLAYER_SIZE = { width: 50, height: 50 }; // 飞船的大小

    static BOSS_IMAGE = '../img/2025/2/13/xie.png'; // BOSS的图片地址
    static BOSS_SIZE = { width: 100, height: 100 }; // BOSS的大小
    static BOSS_MAX_HEALTH = 100; // BOSS的最大血量
    static BOSS_BASE_SPEED = 2; // BOSS的基础移动速度
    static BOSS_RANDOM_MOVE_RANGE = { x: 10, y: 5 }; // BOSS随机移动范围
    static BOSS_SPEED_INCREASE_FACTOR = 0.02; // BOSS血量越低，移动速度越快
}

// 加载图片
const images = {
    player: new Image(),
    boss: new Image(),
    bulletA: new Image(),
    bulletB: new Image()
};

images.player.src = Config.PLAYER_IMAGE; // 飞船图片
images.boss.src = Config.BOSS_IMAGE; // BOSS图片
images.bulletA.src = Config.BULLET_A_IMAGE; // 子弹A图片
images.bulletB.src = Config.BULLET_B_IMAGE; // 子弹B图片

// 确保所有图片加载完成
let imagesLoaded = 0;
Object.values(images).forEach(img => {
    img.onload = () => {
        imagesLoaded++;
        if (imagesLoaded === Object.keys(images).length) {
            gameLoop();
        }
    };
});

const player = {
    x: canvas.width / 2 - Config.PLAYER_SIZE.width / 2,
    y: canvas.height - 60,
    width: Config.PLAYER_SIZE.width,
    height: Config.PLAYER_SIZE.height,
    speed: 5,
    bullets: [],
    isInvincible: false, // 无敌状态
    invincibleTimer: 0, // 无敌计时器
    bulletCooldown: 0 // 子弹发射冷却
};

const boss = {
    x: canvas.width / 2 - Config.BOSS_SIZE.width / 2,
    y: 20,
    width: Config.BOSS_SIZE.width,
    height: Config.BOSS_SIZE.height,
    speed: Config.BOSS_BASE_SPEED,
    health: Config.BOSS_MAX_HEALTH,
    maxHealth: Config.BOSS_MAX_HEALTH, // BOSS最大血量
    bullets: [],
    moveCooldown: 0 // BOSS移动冷却
};

// 监听窗口大小变化，调整画布大小
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// 监听鼠标移动，控制飞船
canvas.addEventListener('mousemove', (e) => {
    player.x = e.clientX - player.width / 2;
    player.y = e.clientY - player.height / 2;
});

function drawImage(img, x, y, width, height) {
    ctx.drawImage(img, x, y, width, height);
}

function drawPlayer() {
    if (player.isInvincible) {
        // 无敌状态下闪烁效果
        if (Math.floor(player.invincibleTimer / 10) % 2 === 0) {
            drawImage(images.player, player.x, player.y, player.width, player.height);
        }
    } else {
        drawImage(images.player, player.x, player.y, player.width, player.height);
    }
}

function drawBoss() {
    drawImage(images.boss, boss.x, boss.y, boss.width, boss.height);

    // 绘制BOSS血条
    const barWidth = boss.width;
    const barHeight = 5;
    const healthPercent = boss.health / boss.maxHealth;

    ctx.fillStyle = 'red';
    ctx.fillRect(boss.x, boss.y - 10, barWidth, barHeight);
    ctx.fillStyle = 'green';
    ctx.fillRect(boss.x, boss.y - 10, barWidth * healthPercent, barHeight);
}

function drawBullets(bullets, img, size) {
    bullets.forEach(bullet => {
        drawImage(img, bullet.x, bullet.y, size.width, size.height);
    });
}

function moveBoss() {
    if (boss.moveCooldown <= 0) {
        // 随机移动
        const moveX = (Math.random() - 0.5) * Config.BOSS_RANDOM_MOVE_RANGE.x;
        const moveY = (Math.random() - 0.5) * Config.BOSS_RANDOM_MOVE_RANGE.y;

        // BOSS血量越低，移动速度越快
        const speedMultiplier = 1 + (Config.BOSS_MAX_HEALTH - boss.health) * Config.BOSS_SPEED_INCREASE_FACTOR;
        boss.x += moveX * speedMultiplier;
        boss.y += moveY * speedMultiplier;

        // 限制BOSS在画布内移动
        boss.x = Math.max(0, Math.min(canvas.width - boss.width, boss.x));
        boss.y = Math.max(0, Math.min(canvas.height / 4, boss.y));

        boss.moveCooldown = 30; // 设置移动冷却时间
    } else {
        boss.moveCooldown--;
    }
}

function updateBullets(bullets) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y += bullets[i].speed;
        if (bullets[i].y > canvas.height || bullets[i].y < 0) {
            bullets.splice(i, 1);
        }
    }
}

function checkCollisions() {
    // 玩家子弹与BOSS子弹碰撞
    player.bullets.forEach((pBullet, pIndex) => {
        boss.bullets.forEach((bBullet, bIndex) => {
            if (pBullet.x < bBullet.x + Config.BULLET_A_SIZE.width &&
                pBullet.x + Config.BULLET_B_SIZE.width > bBullet.x &&
                pBullet.y < bBullet.y + Config.BULLET_A_SIZE.height &&
                pBullet.y + Config.BULLET_B_SIZE.height > bBullet.y) {
                player.bullets.splice(pIndex, 1);
                boss.bullets.splice(bIndex, 1);
            }
        });

        // 玩家子弹与BOSS碰撞
        if (pBullet.x < boss.x + boss.width &&
            pBullet.x + Config.BULLET_B_SIZE.width > boss.x &&
            pBullet.y < boss.y + boss.height &&
            pBullet.y + Config.BULLET_B_SIZE.height > boss.y) {
            boss.health -= 10;
            player.bullets.splice(pIndex, 1);
        }
    });

    // BOSS子弹与玩家碰撞
    if (!player.isInvincible) {
        boss.bullets.forEach(bBullet => {
            if (bBullet.x < player.x + player.width &&
                bBullet.x + Config.BULLET_A_SIZE.width > player.x &&
                bBullet.y < player.y + player.height &&
                bBullet.y + Config.BULLET_A_SIZE.height > player.y) {
                player.isInvincible = true;
                player.invincibleTimer = 120; // 2秒无敌时间（60帧/秒 * 2秒）
            }
        });
    }
}

function resetGame() {
    boss.health = Config.BOSS_MAX_HEALTH; // 重置BOSS血量
    player.bullets = [];
    boss.bullets = [];
    player.isInvincible = false;
    player.invincibleTimer = 0;
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPlayer();
    drawBoss();
    drawBullets(player.bullets, images.bulletB, Config.BULLET_B_SIZE);
    drawBullets(boss.bullets, images.bulletA, Config.BULLET_A_SIZE);
    moveBoss();
    updateBullets(player.bullets);
    updateBullets(boss.bullets);
    checkCollisions();

    // 更新无敌状态
    if (player.isInvincible) {
        player.invincibleTimer--;
        if (player.invincibleTimer <= 0) {
            player.isInvincible = false;
        }
    }

    // 玩家自动发射子弹
    if (player.bulletCooldown <= 0) {
        player.bullets.push({
            x: player.x + player.width / 2 - Config.BULLET_B_SIZE.width / 2,
            y: player.y,
            speed: Config.BULLET_B_SPEED
        });
        player.bulletCooldown = 30; // 设置子弹发射间隔
    } else {
        player.bulletCooldown--;
    }

    // BOSS发射子弹
    if (Math.random() < 0.02) { // 每帧2%的概率发射子弹
        boss.bullets.push({
            x: boss.x + boss.width / 2 - Config.BULLET_A_SIZE.width / 2,
            y: boss.y + boss.height,
            speed: Config.BULLET_A_SPEED
        });
    }

    // 检查胜利条件
    if (boss.health <= 0) {
        alert('You Win!');
        resetGame();
    }

    requestAnimationFrame(gameLoop);
}
