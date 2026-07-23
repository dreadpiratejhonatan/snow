// Teste rápido: constrói o mundo e simula frames para pegar erros de runtime.
// Rodar da raiz do projeto: npm run test:smoke
import * as THREE from "three";
import { World } from "../src/js/world.js";
import { Player } from "../src/js/player.js";
import { CONFIG } from "../src/js/config.js";

try {
  const scene = new THREE.Scene();
  const world = new World(scene);
  console.log("World OK — colliders:", world.colliders.length, "trees:", world.trees.length);

  const camera = new THREE.PerspectiveCamera(75, 1.6, 0.1, 500);
  const player = new Player(camera, scene, world, world.getSpawn());
  player.applySkin("arctic");
  if (player.skinId !== "arctic") throw new Error("applySkin falhou");
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
  for (const t of ["bear_minion", "bear_elite", "wolf", "werewolf", "mula", "slender", "chuck"]) {
    if (!types.has(t)) throw new Error(`inimigo ausente: ${t}`);
  }
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
  const wolf = world.enemies.find((e) => e.type === "wolf" && e.alive);
  const origin = wolf.mesh.position.clone();
  origin.y += 0.9;
  origin.z -= 10;
  const dir = new THREE.Vector3(0, 0, 1);
  const shot = world.hitscan(origin, dir, 999, 50);
  if (!shot || shot.enemy !== wolf) throw new Error("hitscan não acertou o lobo");
  if (wolf.alive) throw new Error("lobo deveria morrer no hitscan");

  let chuck = world.enemies.find((e) => e.type === "chuck" && e.alive);
  if (!chuck) chuck = world.spawnEnemyNow("chuck");
  world.spawnProjectile({
    pos: chuck.mesh.position.clone().add(new THREE.Vector3(0, 1.0, -4)),
    dir: new THREE.Vector3(0, 0.05, 1).normalize(),
    speed: 40,
    damage: 999,
    kind: "arrow",
  });
  for (let i = 0; i < 40; i++) world.updateProjectiles(0.016);
  if (chuck.alive) throw new Error("flecha deveria matar o Chuck");

  let were = world.enemies.find((e) => e.type === "werewolf" && e.alive);
  if (!were) were = world.spawnEnemyNow("werewolf");
  world.explodeAt(were.mesh.position.clone(), 999, 6);
  if (were.alive) throw new Error("explosão deveria matar o lobisomem");
  const ammoDrop = world.items.find((i) => i.ammoType);
  if (!ammoDrop) throw new Error("nenhum pickup/drop de munição no mundo");
  if (!CONFIG.skins.classic) throw new Error("CONFIG.skins ausente");

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
  const minion = world.enemies.find((e) => e.type === "bear_minion" && e.alive);
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

  console.log("Arsenal + skins + traps + drops + NPC fight OK");

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

  for (let i = 0; i < 60; i++) {
    world.update(0.016, i * 0.016, 0.5, 0.1, player.position);
  }
  console.log("SMOKE OK — pos final:", player.position.toArray().map((n) => n.toFixed(2)).join(", "));
} catch (err) {
  console.error("SMOKE FAIL:", err);
  process.exit(1);
}
