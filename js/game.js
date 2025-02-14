const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    }
};

const game = new Phaser.Game(config);

let ship, bullets, enemies, cursors, fireButton;

function preload() {
    // 加载资源
    this.load.image('background', '../img/2025/2/14/background.jpg');
    this.load.image('ship', '../img/2025/2/13/feichuan.png');
    this.load.image('bullet', '../img/2025/2/13/wDog.png');
    this.load.image('enemy', '../img/2025/2/13/xie.png');
}

function create() {
    // 创建两张背景图
    const bg1 = this.add.tileSprite(config.width / 2, config.height / 2, config.width, config.height, 'background');
    const bg2 = this.add.tileSprite(config.width / 2, -config.height / 2, config.width, config.height, 'background');

    // 创建玩家飞船
    ship = this.physics.add.sprite(config.width / 2, config.height - 50, 'ship');
    ship.setDisplaySize(50, 50); // 设置飞船大小为 50x50
    ship.setCollideWorldBounds(true);

    // 创建子弹组
    bullets = this.physics.add.group({
        defaultKey: 'bullet',
        runChildUpdate: true // 允许子对象更新
    });

    // 创建敌人组
    enemies = this.physics.add.group();
    createEnemies.call(this);

    // 设置输入
    cursors = this.input.keyboard.createCursorKeys();
    fireButton = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // 碰撞检测
    this.physics.add.collider(bullets, enemies, hitEnemy, null, this);

    // 自动发射子弹
    this.time.addEvent({
        delay: 200, // 每 200 毫秒发射一次子弹
        callback: shootBullet,
        callbackScope: this,
        loop: true
    });

    // 监听鼠标移动
    this.input.on('pointermove', (pointer) => {
        ship.x = pointer.x; // 飞船跟随鼠标移动
    });

    // 背景滚动
    this.events.on('update', () => {
        bg1.tilePositionY += 1; // 背景1向下滚动
        bg2.tilePositionY += 1; // 背景2向下滚动
    });

    // 监听窗口大小变化
    window.addEventListener('resize', () => {
        game.scale.resize(window.innerWidth, window.innerHeight);
    });
}

function update() {
    // 玩家移动
    if (cursors.left.isDown) {
        ship.setVelocityX(-200);
    } else if (cursors.right.isDown) {
        ship.setVelocityX(200);
    } else {
        ship.setVelocityX(0);
    }

    // 回收飞出屏幕的子弹
    bullets.getChildren().forEach((bullet) => {
        if (bullet.y < -bullet.displayHeight) {
            bullets.killAndHide(bullet); // 回收子弹
        }
    });
}

function createEnemies() {
    for (let i = 0; i < 10; i++) {
        const enemy = enemies.create(Phaser.Math.Between(50, config.width - 50), Phaser.Math.Between(50, 200), 'enemy');
        enemy.setDisplaySize(40, 40); // 设置敌人大小为 40x40
        enemy.setVelocityX(Phaser.Math.Between(-50, 50));
        enemy.setCollideWorldBounds(true);
        enemy.setBounce(1, 1);
    }
}

function shootBullet() {
    const bullet = bullets.get(ship.x, ship.y, 'bullet');
    if (bullet) {
        bullet.setActive(true);
        bullet.setVisible(true);
        bullet.setDisplaySize(10, 20); // 设置子弹大小为 10x20
        bullet.setVelocityY(-300); // 设置子弹速度
    }
}

function hitEnemy(bullet, enemy) {
    bullet.setActive(false);
    bullet.setVisible(false);
    enemy.disableBody(true, true);

    // 检查是否所有敌人都被消灭
    if (enemies.countActive(true) === 0) {
        createEnemies.call(this);
    }
}
