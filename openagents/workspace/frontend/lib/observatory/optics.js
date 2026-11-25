// Ray tracing and textures adapted from the Umbra observatory.
import { cpuRenderer } from './software';

/* Each ray stays in one plane in Schwarzschild spacetime. The lookup table
   gives its inverse radius at a given angular displacement. Intersections
   with the emitting plane are spaced by pi along that geodesic. */
const vertexSource = 'attribute vec2 point;void main(){gl_Position=vec4(point,0.,1.);}';
const fragmentSource = `
precision highp float;
uniform vec2 res, center;
uniform float incl, az, zoom, ev, clock, lens;
uniform sampler2D rays, plasma, sky;
const float PI=3.14159265;
vec3 path(float b,float phi){
    return texture2D(rays,(vec2(clamp(b/64.,0.,1.)*2047.,phi/(3.*PI)*679.)+.5)/vec2(2048.,680.)).rgb;
}
void main(){
    vec2 uv=(gl_FragCoord.xy-center*res)/min(res.x,res.y);
    vec2 pos=uv*28./zoom;
    float roll=.13;
    pos=mat2(cos(roll),-sin(roll),sin(roll),cos(roll))*pos;
    float b=max(.001,length(pos));
    vec2 n=pos/b;
    float s=sin(incl), c=cos(incl);
    float phi=mod(atan(-c,n.y*s)+PI,PI);
    float esc=dot(vec2(path(b,0.).b,path(b,3.*PI/679.).b),vec2(65280.,255.))/65535.*3.*PI;
    float direction=PI-atan(b*.019)+lens*(esc-PI);
    vec3 ray=vec3(s*cos(direction)-c*n.y*sin(direction),n.x*sin(direction),c*cos(direction)+s*n.y*sin(direction));
    vec2 st=vec2(fract((atan(ray.y,ray.x)+az)/(2.*PI)+.5),acos(clamp(ray.z,-1.,1.))/PI);
    vec3 bg=texture2D(sky,st).rgb;
    // Match sky contrast to the dim outer disc and resolve captured rays.
    bg=bg*1.45+vec3(.004,.005,.009);
    bg*=smoothstep(5.16,5.23,b);
    float energy=0.;
    float radiusGlow=0.;
    for(int layer=0;layer<3;layer++){
        float angle=phi+float(layer)*PI;
        vec3 samplePath=path(b,angle);
        float u=dot(samplePath.rg,vec2(65280./65535.,255./65535.))*.5;
        float r=1./max(.0001,u);
        if(r>5.6 && r<42.){
            float lon=atan(n.x*sin(angle),s*cos(angle)-c*n.y*sin(angle))+az;
            float radial=log(r/6.)/log(42./6.);
            float phase=fract(clock/42.);
            float speed=1.08*pow(7./r,1.5);
            float flow=lon/(2.*PI)-clock*.01;
            vec2 coord=vec2(fract(flow-phase*speed),clamp(radial,.001,.999));
            float gas1=texture2D(plasma,coord).r;
            coord.x=fract(flow-fract(phase+.5)*speed+.37);
            float gas=mix(texture2D(plasma,coord).r,gas1,sin(PI*phase)*sin(PI*phase));
            float beam=pow(1./(1.+.43*n.x*s*sqrt(7./r)),2.);
            float edge=smoothstep(5.65,6.75,r)*(1.-smoothstep(22.,41.,r));
            float intensity=2.0*pow(7.9/r,2.8)*beam*exp((gas-.5)*2.8)*edge;
            energy+=intensity*pow(.29,float(layer));
            radiusGlow+=.25*pow(8./r,1.65)*edge;
        }
    }
    // A soft optical halo surrounds the bright filamentary emission.
    float arc=abs(b-5.24);
    float ring=(.085*exp(-arc*2.1)+.32*exp(-arc*31.))*(.87-.22*n.x);
    float atmosphere=.074*exp(-abs(b-6.)*.47)+.033*exp(-abs(pos.y+.9)*.46-abs(pos.x)*.065);
    float light=(energy+ring)*exp2(ev);
    vec3 emission=1.-exp(-light*vec3(1.52,.72,.34));
    vec3 col=bg*exp(-light*2.)+emission+(radiusGlow*.055+atmosphere)*vec3(1.,.49,.28);
    float vignette=1.-.16*dot(uv,uv);
    gl_FragColor=vec4(clamp(col*vignette,0.,1.),1.);
}`;

async function loadOpticsImages() {
    const sources = ['geodesics.png', 'plasma.jpg', 'celestial-sphere.jpg']
        .map(name => '/observatory/' + name);
    return Promise.all(sources.map(async src => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return img;
    }));
}

export async function blackHoleRenderer(canvas, signal) {
    const images = await loadOpticsImages();
    signal.throwIfAborted();
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!gl) return cpuRenderer(canvas,images);
    function compile(type,source){
        const shader=gl.createShader(type);
        gl.shaderSource(shader,source); gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
        return shader;
    }
    const program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const point=gl.getAttribLocation(program,'point');
    gl.enableVertexAttribArray(point);gl.vertexAttribPointer(point,2,gl.FLOAT,false,0,0);
    const uniform=name=>gl.getUniformLocation(program,name);
    const uniforms=Object.fromEntries(['res','center','incl','az','zoom','ev','clock','lens'].map(n=>[n,uniform(n)]));
    gl.disable(gl.DITHER);
    images.forEach((img,i)=>{
        gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);
        for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
        for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
        if(i===1){
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        }
        gl.uniform1i(uniform(['rays','plasma','sky'][i]),i);
    });
    // Separable Gaussian bloom at quarter resolution retains the sharp ray image.
    function postPass(body) {
        const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vertexSource));
        gl.attachShader(p,compile(gl.FRAGMENT_SHADER,'precision highp float;uniform sampler2D src,glow;uniform vec2 size,stepUV;void main(){vec2 uv=gl_FragCoord.xy/size;'+body+'}'));
        gl.bindAttribLocation(p,point,'point');gl.linkProgram(p);
        if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
        return {p,size:gl.getUniformLocation(p,'size'),step:gl.getUniformLocation(p,'stepUV')};
    }
    const blur=postPass('vec3 c=texture2D(src,uv).rgb*.227027;for(int i=1;i<=4;i++){float f=float(i);float k=exp(-.162*f*f)*.227027;c+=k*(texture2D(src,uv+f*stepUV).rgb+texture2D(src,uv-f*stepUV).rgb);}gl_FragColor=vec4(c,1.);');
    const combine=postPass('vec3 c=texture2D(src,uv).rgb;vec3 halo=texture2D(glow,uv).rgb;gl_FragColor=vec4(c+.58*pow(halo,vec3(1.4))*(1.-.72*c),1.);');
    for(const pass of [blur,combine]){gl.useProgram(pass.p);gl.uniform1i(gl.getUniformLocation(pass.p,'src'),3);}
    gl.uniform1i(gl.getUniformLocation(combine.p,'glow'),4);
    function target(){
        const fb=gl.createFramebuffer(), tex=gl.createTexture();
        gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,tex);
        for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
        for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
        return {fb,tex,w:0,h:0};
    }
    const scene=target(),haze=target(),glow=target();
    function resize(t,w,h){
        if(t.w===w&&t.h===h)return;t.w=w;t.h=h;
        gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,t.tex);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    }
    function blit(pass,source,fb,w,h,dx,dy){
        gl.useProgram(pass.p);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,w,h);
        gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,source);
        gl.uniform2f(pass.size,w,h);gl.uniform2f(pass.step,dx,dy);gl.drawArrays(gl.TRIANGLES,0,3);
    }
    return {fps:30,dispose(){gl.getExtension('WEBGL_lose_context')?.loseContext();},draw(state,w,h){
        if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
        const sw=Math.max(1,w>>2),sh=Math.max(1,h>>2);
        resize(scene,w,h);resize(haze,sw,sh);resize(glow,sw,sh);
        gl.useProgram(program);gl.bindFramebuffer(gl.FRAMEBUFFER,scene.fb);gl.viewport(0,0,w,h);
        gl.uniform2f(uniforms.res,w,h);
        gl.uniform2f(uniforms.center,state.centerX,1-state.centerY);
        for(const [name,value] of Object.entries(state)) if(name in uniforms) gl.uniform1f(uniforms[name],value);
        gl.drawArrays(gl.TRIANGLES,0,3);
        const radius=Math.min(w,h)*.011;
        blit(blur,scene.tex,haze.fb,sw,sh,radius/w,0);
        blit(blur,haze.tex,glow.fb,sw,sh,0,radius/h);
        gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,glow.tex);
        blit(combine,scene.tex,null,w,h,0,0);
    }};
}
