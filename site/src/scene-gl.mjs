export const QUAD_VERTEX='attribute vec2 p; varying vec2 vUv; void main(){vUv=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}';
export function createSceneGL(canvas,fragment){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false});
  if(!gl)return null;
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  let program;
  try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,QUAD_VERTEX));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));}catch(error){console.warn('Scene shader unavailable:',error.message);return null;}
  gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
  const locations=new Map();
  const at=name=>{if(!locations.has(name))locations.set(name,gl.getUniformLocation(program,name));return locations.get(name);};
  const api={
    size(limit=1.5){const b=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,limit),w=Math.max(1,Math.round(b.width*d)),h=Math.max(1,Math.round(b.height*d));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);return [b.width,b.height];},
    float(name,value){gl.uniform1f(at(name),value);},vec2(name,a,b){gl.uniform2f(at(name),a,b);},vec3(name,value){gl.uniform3fv(at(name),value);},vec4(name,value){gl.uniform4fv(at(name),value);},
    texture(name,url,index){
      const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.uniform1i(at(name),index);
      return new Promise(resolve=>{const upload=img=>{let source=img;const max=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE));if(img.width>max||img.height>max){const factor=max/Math.max(img.width,img.height),c=document.createElement('canvas');c.width=img.width*factor;c.height=img.height*factor;c.getContext('2d').drawImage(img,0,0,c.width,c.height);source=c;}gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);resolve(true);};if(typeof url!=='string'){upload(url);return;}const img=new Image();img.onload=()=>upload(img);img.onerror=()=>resolve(false);img.src=url;});
    },
    draw(){gl.drawArrays(gl.TRIANGLES,0,6);},
  };return api;
}
