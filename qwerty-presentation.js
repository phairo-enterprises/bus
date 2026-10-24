// Presentation-only reuse of the accepted r128 QWERTY. No terminal or navigation owner.
function createRecoveredQwerty({THREE, document, window, camera, mount}) {
const KEY_ROWS = [
  ["ESC", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "BACK"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "ENTER"],
  ["Z", "X", "C", "V", "B", "N", "M", ".", "/"],
  ["ArrowLeft", "ArrowRight", "[", "]", "-", "="],
  ["SPACE"],
];
function createTextSurface(worldWidth, worldHeight, pixelWidth = 1280, pixelHeight = 720) {
  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding; // Explicit r128 equivalent; no renderer output changes.
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth, worldHeight), material);
  mesh.renderOrder = 200;
  return { mesh, canvas, context, texture };
}

function drawLabel(surface, title, subtitle, color = "#00f4ff", options) {
  const { canvas, context, texture } = surface;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = options?.dim ? "rgba(0, 7, 12, .88)" : "rgba(0, 7, 12, .72)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (options?.border !== false) {
    context.strokeStyle = color;
    context.lineWidth = 4;
    context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  }
  context.textAlign = options?.align ?? "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.font = `600 ${Math.round(canvas.height * 0.26)}px ui-monospace, monospace`;
  const x = options?.align === "left" ? canvas.width * 0.08 : canvas.width / 2;
  context.fillText(title, x, canvas.height * 0.43);
  context.fillStyle = "rgba(220, 253, 255, .65)";
  context.font = `500 ${Math.round(canvas.height * 0.11)}px ui-monospace, monospace`;
  context.fillText(subtitle, x, canvas.height * 0.7);
  texture.needsUpdate = true;
}
const keys=[];
    const keyboardGroup = new THREE.Group();
    keyboardGroup.position.set(0, -2.6, -7.2);
    keyboardGroup.rotation.x = 0.48; // Face existing key labels toward their camera, not behind nearer rows.
    keyboardGroup.scale.setScalar(0.7);
    keyboardGroup.visible = false;
    camera.add(keyboardGroup);

    const board = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.25, 5.6), new THREE.MeshStandardMaterial({ color: 0x03151d, roughness: 0.35, metalness: 0.6, transparent: true, opacity: 0.93 }));
    board.position.z = 0.25;
    keyboardGroup.add(board);
    const boardEdge = new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), new THREE.LineBasicMaterial({ color: 0x00f4ff, transparent: true, opacity: 0.34 }));
    boardEdge.position.copy(board.position);
    keyboardGroup.add(boardEdge);

    const keyMaterial = new THREE.MeshStandardMaterial({ color: 0x072a34, roughness: 0.3, metalness: 0.45, emissive: 0x001a20, emissiveIntensity: 0.6 });
    const keyGeometry = new THREE.BoxGeometry(0.82, 0.26, 0.7);
    KEY_ROWS.forEach((row, rowIndex) => {
      const widths = row.map((key) => key === "SPACE" ? 5.4 : key === "ENTER" || key === "BACK" ? 1.35 : 0.84);
      const total = widths.reduce((sum, value) => sum + value, 0) + (row.length - 1) * 0.12;
      let x = -total / 2;
      row.forEach((key, keyIndex) => {
        const width = widths[keyIndex];
        const mesh = new THREE.Mesh(keyGeometry, keyMaterial.clone());
        mesh.scale.x = width / 0.82;
        mesh.position.set(x + width / 2, 0.28, 2.1 - rowIndex * 0.83);
        mesh.userData.action = "key";
        mesh.userData.key = key;
        keyboardGroup.add(mesh);
        keys.push(mesh);
        const keyLabel = createTextSurface(width * 0.75, 0.42, 260, 120);
        drawLabel(keyLabel, ({ArrowLeft:"←",ArrowRight:"→"})[key] || key, "", "#93faff", { border: false });
        keyLabel.mesh.position.set(mesh.position.x, 0.425, mesh.position.z - 0.02);
        keyLabel.mesh.rotation.x = -Math.PI / 2;
        keyboardGroup.add(keyLabel.mesh);
        x += width + 0.12;
      });
    });
 let disposed=false;
 function projectedBounds() {
   camera.updateWorldMatrix(true,true);
   let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
   keyboardGroup.traverse(object=>{
     if(!object.geometry)return;
     object.geometry.computeBoundingBox();const b=object.geometry.boundingBox;
     for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
       const v=new THREE.Vector3(x,y,z).applyMatrix4(object.matrixWorld).project(camera);
       const px=(v.x+1)*window.innerWidth/2,py=(1-v.y)*window.innerHeight/2;
       left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
     }
   });
   return {left,right,top,bottom};
 }
 function fit() {
   if(disposed)return;
   const r=mount.getBoundingClientRect();
   keyboardGroup.position.set(0,-2.6,-7.2);keyboardGroup.scale.setScalar(.7);
   for(let i=0;i<12;i++){
     const b=projectedBounds();
     const ratio=Math.min((r.width-8)/(b.right-b.left),(r.height-8)/(b.bottom-b.top),1);
     keyboardGroup.scale.multiplyScalar(Math.max(.001,ratio));
     const halfH=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*7.2,halfW=halfH*camera.aspect;
     keyboardGroup.position.x+=((r.left+r.width/2)-(b.left+b.right)/2)*2/window.innerWidth*halfW;
     keyboardGroup.position.y-=((r.top+r.height/2)-(b.top+b.bottom)/2)*2/window.innerHeight*halfH;
   }
 }
 function hit(x,y){
   if(disposed||!keyboardGroup.visible)return null;
   const pointer=new THREE.Vector2(x/window.innerWidth*2-1,-y/window.innerHeight*2+1);
   const raycaster=new THREE.Raycaster();camera.updateWorldMatrix(true,true);raycaster.setFromCamera(pointer,camera);
   const target=raycaster.intersectObjects(keys,true).find(hit=>{let o=hit.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});
   return target ? String(target.object.userData.key) : null;
 }
 function dispose(){
   if(disposed)return;disposed=true;camera.remove(keyboardGroup);
   const resources=new Set([keyMaterial,keyGeometry]);keyboardGroup.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){resources.add(m);if(m.map)resources.add(m.map)}});for(const r of resources)r.dispose();
 }
 return {group:keyboardGroup,keys,fit,hit,projectedBounds,dispose,get visible(){return !disposed&&keyboardGroup.visible},setVisible(value){if(disposed)return;keyboardGroup.visible=Boolean(value);if(value)fit()}};
}
