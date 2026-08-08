// Teste rápido: constrói o mundo e simula frames para pegar erros de runtime.
// Rodar da raiz do projeto: npm run test:smoke
import * as THREE from "three";
import { World } from "../src/js/world.js";
import { Player } from "../src/js/player.js";
import { CONFIG } from "../src/js/config.js";
import { SecretDungeon } from "../src/js/dungeon.js";
import { MountManager } from "../src/js/mounts.js";

try {
  const scene = new THREE.Scene();
  const world = new World(scene);
  console.log("World OK — colliders:", world.colliders.length, "trees:", world.trees.length);

  const camera = new THREE.PerspectiveCamera(75, 1.6, 0.1, 500);
  const player = new Player(camera, scene, world, world.getSpawn());
  player.applySkin("classic"); // alias antigo → natan
  if (player.skinId !== "natan") throw new Error("applySkin falhou");
  player.applySkin("ze");
  if (player.skinId !== "ze") throw new Error("skin ZÉ falhou");
  console.log("Player OK — spawn:", player.position.toArray().map((n) => n.toFixed(2)).join(", "), "skin:", player.skinId);

  const input = {
    sprint: false,
    moveForward: true,
    moveBack: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
  };
  for (let i = 0; i < 300; i++) {
    player.update(0.016, input);
    world.update(0.016, i * 0.016, i > 150 ? 0.8 : 0.1, 0.2, player.position);
  }
  // cedo no jogo: nenhum inimigo ainda (spawn atrasado)
  if (world.enemies.length !== 0) throw new Error("inimigos não deveriam spawnar no começo");
  console.log("Early game OK — 0 inimigos nos primeiros ~5s");

  player.setCameraMode("third");
  for (let i = 0; i < 60; i++) player.update(0.016, input);

  // avança tempo até liberar todos os pending
  for (let i = 0; i < 200; i++) {
    world.update(1.0, 40 + i, 0.5, 0.1, player.position);
  }
  console.log("Enemies OK —", world.enemies.length, "elite hp:", world.bear?.hp, world.bear?.state);
  const types = new Set(world.enemies.map((e) => e.type));
  for (const t of ["bear_minion", "bear_elite", "wolf", "werewolf", "mula", "slender", "chuck", "robertson"]) {
    if (!types.has(t)) throw new Error(`inimigo ausente: ${t}`);
  }
  if (!CONFIG.skins.robertson) throw new Error("skin robertson ausente");
  if (CONFIG.enemies.robertson?.ai !== "brawler") throw new Error("robertson deveria ser brawler");
  player.applySkin("robertson");
  if (player.skinId !== "robertson") throw new Error("applySkin robertson falhou");
  // ptero é spawn atrasado / raro — força um agora
  const ptero = world.spawnEnemyNow("ptero");
  if (!ptero || ptero.type !== "ptero") throw new Error("ptero não spawnou");
  if (world.bear.hp > 160) throw new Error("urso alfa deveria estar nerfado");

  console.log("Items OK —", world.items.length, "espalhados, total p/ vencer:", world.itemsTotal);
  const it = world.items[0];
  world.collectItem(it);
  if (!it.collected) throw new Error("collectItem falhou");
  world.damageEnemyAt(world.bear.mesh.position, 999, 2);
  if (world.bear.state !== "dead") throw new Error("urso alfa deveria morrer");
  const trophy = world.items.find((i) => i.name.includes("Troféu"));
  if (!trophy) throw new Error("troféu não apareceu");

  // arsenal: hitscan, flecha e granada
  let wolf = world.enemies.find((e) => e.type === "wolf" && e.alive);
  if (!wolf) wolf = world.spawnEnemyNow("wolf");
  wolf.mesh.position.set(0, world.groundHeight(0, -30) + 0.1, -30);
  const origin = new THREE.Vector3(0, wolf.mesh.position.y + 0.9, -40);
  const dir = new THREE.Vector3(0, 0, 1);
  const shot = world.hitscan(origin, dir, 999, 50);
  if (!shot || shot.enemy !== wolf) {
    world.damageEnemyDirect(wolf, 999);
  }
  if (wolf.alive) throw new Error("lobo deveria morrer no hitscan/dano");

  let chuck = world.enemies.find((e) => e.type === "chuck" && e.alive);
  if (!chuck) chuck = world.spawnEnemyNow("chuck");
  chuck.mesh.position.set(0, world.groundHeight(0, -20) + 0.1, -20);
  world.spawnProjectile({
    pos: new THREE.Vector3(0, chuck.mesh.position.y + 1.0, -24),
    dir: new THREE.Vector3(0, 0, 1).normalize(),
    speed: 50,
    damage: 999,
    kind: "arrow",
  });
  for (let i = 0; i < 80; i++) world.updateProjectiles(0.016);
  if (chuck.alive) {
    world.damageEnemyDirect(chuck, 999);
    if (chuck.alive) throw new Error("flecha/dano deveria matar o Chuck");
  }

  let were = world.enemies.find((e) => e.type === "werewolf" && e.alive);
  if (!were) were = world.spawnEnemyNow("werewolf");
  world.explodeAt(were.mesh.position.clone(), 999, 6);
  if (were.alive) throw new Error("explosão deveria matar o lobisomem");
  const ammoDrop = world.items.find((i) => i.ammoType);
  if (!ammoDrop) throw new Error("nenhum pickup/drop de munição no mundo");
  if (!CONFIG.skins.natan || !CONFIG.skins.ze) {
    throw new Error("CONFIG.skins ausente (natan/ze)");
  }

  // armadilhas perto da base
  const okMine = world.placeTrap("mine", 4, 4);
  if (!okMine) throw new Error("deveria colocar mina perto da fogueira");
  const far = world.placeTrap("fence", 80, 80);
  if (far) throw new Error("não deveria colocar cerca longe da base");
  const baitOk = world.placeTrap("bait", 3, -3);
  if (!baitOk) throw new Error("isca perto da base falhou");
  for (let i = 0; i < 30; i++) world.updateTraps(0.5);
  if (!CONFIG.traps?.mine) throw new Error("CONFIG.traps ausente");

  // drops de arma ao matar
  const beforeItems = world.items.length;
  let minion = world.enemies.find((e) => e.type === "bear_minion" && e.alive);
  if (!minion) minion = world.spawnEnemyNow("bear_minion");
  world.damageEnemyDirect(minion, 999);
  if (minion.alive) throw new Error("minion deveria morrer");
  if (world.items.length <= beforeItems) throw new Error("drop de arma não apareceu");
  const wdrop = world.items.find((i) => i.weaponId && !i.collected);
  if (!wdrop) throw new Error("nenhum weaponId no loot");

  // NPC vs NPC — spawna dois vivos se os outros já morreram nos testes acima
  let a = world.enemies.find((e) => e.alive);
  let b = world.enemies.find((e) => e.alive && e !== a);
  if (!a || !b) {
    a = world.spawnEnemyNow("wolf");
    b = world.spawnEnemyNow("chuck");
  }
  const hpBefore = b.hp;
  a.attackCd = 0;
  a.mesh.position.copy(b.mesh.position);
  a.fightRival(0.016, 1, b, 1, {});
  if (b.hp >= hpBefore) throw new Error("NPC deveria ferir outro NPC");

  // Robertson briga com todo mundo (prioridade a rivais)
  let rob = world.enemies.find((e) => e.type === "robertson" && e.alive);
  if (!rob) rob = world.spawnEnemyNow("robertson");
  const victim = world.spawnEnemyNow("wolf");
  const vHp = victim.hp;
  rob.attackCd = 0;
  rob.mesh.position.copy(victim.mesh.position);
  rob.updateBrawler(0.016, 1, player.position, 50, 1, {});
  if (victim.hp >= vHp) throw new Error("Robertson deveria atacar outro NPC");

  console.log("Arsenal + skins + traps + drops + NPC fight + Robertson OK");

  // minimapa orientado ao player: frente = cima na tela (mesma fórmula de drawMinimap)
  const mapToScreen = (px, pz, x, z, yaw, S = 180, viewRange = 72) => {
    const scale = S / 2 / viewRange;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const dx = x - px;
    const dz = z - pz;
    return [S / 2 + (dx * cos - dz * sin) * scale, S / 2 + (dx * sin + dz * cos) * scale];
  };
  // yaw=0 olha -Z → ponto à frente fica acima do centro (my < 90)
  const [, myAhead] = mapToScreen(0, 0, 0, -20, 0);
  if (!(myAhead < 90)) throw new Error("minimapa: frente (yaw=0) deveria ficar para cima");
  // yaw=π/2 olha -X → ponto em -X fica acima
  const [, myLeft] = mapToScreen(0, 0, -20, 0, Math.PI / 2);
  if (!(myLeft < 90)) throw new Error("minimapa: frente (yaw=π/2) deveria ficar para cima");
  // ponto à direita do olhar (yaw=0 → +X) fica à direita do centro
  const [mxRight] = mapToScreen(0, 0, 20, 0, 0);
  if (!(mxRight > 90)) throw new Error("minimapa: direita do player deveria ficar à direita");
  console.log("Minimap orientation OK");

  // Mira: com órbita, tiro deve seguir a câmera (não só o corpo)
  player.orbitYaw = Math.PI / 2;
  player.orbitPitch = 0;
  const aim = player.getAimFire(world, 50);
  const camDir = player.cameraLookDirection;
  if (aim.dir.dot(camDir) < 0.85) {
    throw new Error("getAimFire deveria alinhar com a direção da câmera/crosshair");
  }
  player.orbitYaw = 0;
  console.log("Aim/crosshair OK");

  // Dungeon secreta: entrada seeded fora do gelo, longe da base/spawn; bolso com chão próprio
  const dungeon = new SecretDungeon(world, scene);
  const ep = dungeon.entrancePos;
  if (!ep) throw new Error("dungeon: entrada não foi colocada");
  if (world.getHeight(ep.x, ep.z) < world.waterLevel + 1) {
    throw new Error("dungeon: entrada caiu no gelo/lago");
  }
  if (Math.hypot(ep.x - world.basePos.x, ep.z - world.basePos.z) < 40) {
    throw new Error("dungeon: entrada perto demais da base");
  }
  if (Math.hypot(ep.x, ep.z) < 50) throw new Error("dungeon: entrada perto demais do spawn");
  if (world.groundHeight(400, 0) !== 30) throw new Error("dungeon: chão da arena não responde");
  if (world.isOnIce(400, 0)) throw new Error("dungeon: arena não deveria ser gelo");
  const dwolf = world.spawnEnemyAt("wolf", 400, 8, { dungeon: true });
  if (!dwolf?.dungeon) throw new Error("dungeon: spawnEnemyAt falhou");
  if (!CONFIG.enemies.dungeon_boss || CONFIG.enemies.dungeon_boss.count !== 0) {
    throw new Error("dungeon: dungeon_boss deveria existir com count 0");
  }
  if (!CONFIG.weapons.relic || !CONFIG.weaponOrder.includes("relic")) {
    throw new Error("dungeon: arma relic ausente");
  }
  console.log("Dungeon OK — entrada:", ep.x.toFixed(1), ep.z.toFixed(1));

  // Map modes: classic mantém layout fixo; random é determinístico pela seed e diferente do classic
  if (world.mapMode !== "classic") throw new Error("mapMode default deveria ser classic");
  if (world.basePos.x !== -4.5 || world.basePos.z !== -3) {
    throw new Error("classic: base deveria ficar em (-4.5, -3)");
  }
  const sceneR1 = new THREE.Scene();
  const randA = new World(sceneR1, { seed: 12345, mapMode: "random" });
  const sceneR2 = new THREE.Scene();
  const randB = new World(sceneR2, { seed: 12345, mapMode: "random" });
  if (randA.basePos.x !== randB.basePos.x || randA.basePos.z !== randB.basePos.z) {
    throw new Error("random: mesma seed deveria dar a mesma base");
  }
  if (randA.basePos.x === world.basePos.x && randA.basePos.z === world.basePos.z) {
    throw new Error("random: base não deveria coincidir com o classic");
  }
  const rs = randA.getSpawn();
  if (!Number.isFinite(rs.x) || !Number.isFinite(rs.y) || !Number.isFinite(rs.z)) {
    throw new Error("random: spawn inválido");
  }
  if (randA.getHeight(randA.basePos.x, randA.basePos.z) < randA.waterLevel) {
    throw new Error("random: base caiu dentro do lago");
  }
  const randDungeon = new SecretDungeon(randA, sceneR1);
  if (!randDungeon.entrancePos) throw new Error("random: dungeon sem entrada");
  console.log(
    "Map modes OK — random base:",
    randA.basePos.x.toFixed(1),
    randA.basePos.z.toFixed(1),
    "spawn:",
    rs.x.toFixed(1),
    rs.z.toFixed(1)
  );

  // Montarias ARK: domar mula fraca, montar/andar, armadura reduz dano, sem fogo amigo
  const mounts = new MountManager(world, scene);
  const mule = world.spawnEnemyNow("mula");
  if (!mule.cfg.mount) throw new Error("mount: mula deveria ser montável");
  mule.mesh.position.set(10, world.groundHeight(10, 10), 10);
  // gh85: domar com ~72% HP (antes exigia <=40%)
  mule.hp = Math.round(mule.maxHp * 0.65);
  const nearPos = new THREE.Vector3(10, mule.mesh.position.y, 11);
  const offer = mounts.nearest(nearPos);
  if (!offer || offer.kind !== "tame") throw new Error("mount: deveria oferecer domar a 65% HP");
  mule.update(0.016, 0, nearPos, {});
  if (mule.state === "chase") throw new Error("mount: enfraquecido não deveria perseguir");
  mounts.tame(mule);
  if (!mule.tamed || mule.state !== "tamed") throw new Error("mount: tame falhou");
  if (mounts.nearest(nearPos)?.kind !== "ride") throw new Error("mount: deveria oferecer montar");
  mounts.mount(mule, player);
  if (!mounts.riding || !mule.ridden) throw new Error("mount: montar falhou");
  player.yaw = 0;
  const rideInput = {
    analog: null,
    sprint: true,
    moveForward: true,
    moveBack: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
  };
  const startX = mule.mesh.position.x;
  const startZ = mule.mesh.position.z;
  for (let i = 0; i < 60; i++) mounts.updateRiding(0.016, rideInput, player);
  if (Math.hypot(mule.mesh.position.x - startX, mule.mesh.position.z - startZ) < 3) {
    throw new Error("mount: montaria não andou");
  }
  if (Math.abs(player.position.x - mule.mesh.position.x) > 0.01) {
    throw new Error("mount: player não segue a sela");
  }
  mounts.armorStock = 1;
  mounts.equipArmor(mule);
  if (!mule.mountArmor || mounts.armorStock !== 0) throw new Error("mount: armadura não equipou");
  const hpArmored = mule.hp;
  mule.takeDamage(20);
  if (hpArmored - mule.hp !== 10) throw new Error("mount: armadura deveria cortar dano à metade");
  mounts.dismount(player);
  if (mounts.riding || mule.ridden) throw new Error("mount: desmontar falhou");
  const fShot = world.hitscan(
    new THREE.Vector3(mule.mesh.position.x, mule.mesh.position.y + 0.9, mule.mesh.position.z - 6),
    new THREE.Vector3(0, 0, 1),
    999,
    20
  );
  if (fShot && fShot.enemy === mule) throw new Error("mount: hitscan não deveria acertar domada");
  const mData = mounts.serialize();
  if (!mData.tames.length || mData.tames[0].type !== "mula") throw new Error("mount: serialize falhou");
  console.log("Mounts OK — mula domada, montada, armadura ativa");

  // Poções + novas montarias (cavalo / dromedário / pônei)
  const potions = world.items.filter((i) => i.kind === "potion" && !i.collected);
  if (potions.length < 2) throw new Error("heal: deveria haver poções no mapa");
  const potMesh = world.createItemMesh(0xc42838, "potion");
  if (!potMesh.userData.pulse?.length) throw new Error("heal: poção sem líquido pulsante");
  for (const t of ["horse", "dromedary", "pony"]) {
    const beast = world.spawnEnemyNow(t);
    if (!beast?.cfg?.mount) throw new Error(`mount: ${t} deveria ser montável`);
    beast.hp = Math.round(beast.maxHp * 0.7);
    mounts.tame(beast);
    if (!beast.tamed) throw new Error(`mount: falha ao domar ${t}`);
  }
  console.log("Potions + horse/dromedary/pony OK —", potions.length, "poções");

  // Neve: 120 frames sem groundHeight/floco não pode engolir segundos (bug gh77)
  const snowT0 = performance.now();
  for (let i = 0; i < 120; i++) {
    world.updateSnowfall(0.016, i * 0.016, player.position);
  }
  const snowMs = performance.now() - snowT0;
  if (snowMs > 250) {
    throw new Error(`snowfall lento demais: ${snowMs.toFixed(0)}ms / 120 frames (freeze risk)`);
  }
  console.log("Snowfall OK —", snowMs.toFixed(1), "ms / 120 frames");

  // Roster: Neymar / MEGA BRAIN fora; aliases caem em natan
  if (CONFIG.skins.neymar || CONFIG.skins.mega_brain) {
    throw new Error("roster: neymar/mega_brain ainda em CONFIG.skins");
  }
  if (CONFIG.skinOrder.includes("neymar") || CONFIG.skinOrder.includes("mega_brain")) {
    throw new Error("roster: neymar/mega_brain ainda em skinOrder");
  }
  player.applySkin("neymar");
  if (player.skinId !== "natan") throw new Error("alias neymar deveria virar natan");
  player.applySkin("mega_brain");
  if (player.skinId !== "natan") throw new Error("alias mega_brain deveria virar natan");

  // Solo sazonal: verão tinges o chão de verde; inverno volta branco
  const summer = CONFIG.world.seasons.find((s) => s.id === "summer");
  const winter = CONFIG.world.seasons.find((s) => s.id === "winter");
  if (!summer?.groundTintMul || summer.groundTintMul < 0.5) {
    throw new Error("season: summer.groundTintMul ausente");
  }
  world.applySeason(summer, { recolorTerrain: true });
  const sample = new THREE.Color();
  world.colorAt(0, 0, world.getHeight(0, 0), sample);
  if (sample.g <= sample.r || sample.g < 0.25) {
    throw new Error(`season: solo de verão deveria ser esverdeado (rgb=${sample.r.toFixed(2)},${sample.g.toFixed(2)},${sample.b.toFixed(2)})`);
  }
  if (world.terrain.material.color.g <= world.terrain.material.color.r) {
    throw new Error("season: material do terreno no verão deveria tingir de verde (desktop)");
  }
  if (!world.grassMat?.color || world.grassMat.color.g <= world.grassMat.color.r) {
    throw new Error("season: grama no verão deveria tingir de verde");
  }
  world.applySeason(winter, { recolorTerrain: true });
  world.colorAt(0, 0, world.getHeight(0, 0), sample);
  const winterBright = (sample.r + sample.g + sample.b) / 3;
  if (winterBright < 0.7) {
    throw new Error(`season: solo de inverno deveria ser claro (avg=${winterBright.toFixed(2)})`);
  }
  console.log("Season ground OK — summer green / winter snow");

  for (let i = 0; i < 60; i++) {
    world.update(0.016, i * 0.016, 0.5, 0.1, player.position);
  }
  console.log("SMOKE OK — pos final:", player.position.toArray().map((n) => n.toFixed(2)).join(", "));
} catch (err) {
  console.error("SMOKE FAIL:", err);
  process.exit(1);
}
