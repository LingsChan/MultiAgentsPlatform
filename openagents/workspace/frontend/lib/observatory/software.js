// Geometry is cached between camera movements for machines without WebGL.
export function cpuRenderer(canvas, images) {
    const textures=images.map(img=>{
        const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
        const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
        return {pixels:ctx.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};
    });
    const [table,gas,sky]=textures, ctx=canvas.getContext('2d',{alpha:false}),pi=Math.PI;
    const {sin,cos,atan2,exp,log,pow,sqrt,min,max}=Math;
    let key='', frame, bg, optics;
    function smooth(a,b,v){const t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t);}
    function geometry(state,w,h){
        canvas.width=w;canvas.height=h;
        frame=ctx.createImageData(w,h);bg=new Float32Array(w*h*5);optics=new Float32Array(w*h*12);
        const scale=28/min(w,h)/state.zoom,s=sin(state.incl),c=cos(state.incl);
        const cr=cos(.13),sr=sin(.13);
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const i=y*w+x,dx=(x+.5-w*state.centerX)*scale,dy=(h*state.centerY-y-.5)*scale;
            const u=dx*cr+dy*sr,v=dy*cr-dx*sr,b=max(.001,Math.hypot(u,v));
            const nx=u/b,ny=v/b,ix=min(2047,Math.round(b/64*2047));
            const escape=(table.pixels[ix*4+2]*256+table.pixels[(table.w+ix)*4+2])/65535*3*pi;
            const dir=pi-Math.atan(b*.019)+state.lens*(escape-pi);
            const rx=s*cos(dir)-c*ny*sin(dir),ry=nx*sin(dir),rz=c*cos(dir)+s*ny*sin(dir);
            const lon=(atan2(ry,rx)+state.az)/(2*pi)+.5;
            const k=4*(min(sky.h-1,Math.floor(Math.acos(max(-1,min(1,rz)))/pi*sky.h))*sky.w+Math.floor((lon-Math.floor(lon))*sky.w));
            const p=i*5,shadow=smooth(5.16,5.23,b);
            for(let ch=0;ch<3;ch++)bg[p+ch]=(sky.pixels[k+ch]/255*1.45+.004)*shadow;
            bg[p+3]=(.085*exp(-Math.abs(b-5.24)*2.1)+.32*exp(-Math.abs(b-5.24)*31))*(.87-.22*nx);
            bg[p+4]=.074*exp(-Math.abs(b-6)*.47)+.033*exp(-Math.abs(v+.9)*.46-Math.abs(u)*.065);
            const phi=(atan2(-c,ny*s)+pi)%pi;
            for(let j=0;j<3;j++){
                const a=phi+j*pi,idx=4*(Math.round(a/(3*pi)*679)*table.w+ix);
                const inv=(table.pixels[idx]*256+table.pixels[idx+1])/131070;
                const r=1/max(.0001,inv);
                if(r<=5.6||r>=42)continue;
                const q=i*12+j*4,edge=smooth(5.65,6.75,r)*(1-smooth(22,41,r));
                optics[q]=2*pow(7.9/r,2.8)*pow(1/(1+.43*nx*s*sqrt(7/r)),2)*edge*pow(.29,j);
                optics[q+1]=(atan2(nx*sin(a),s*cos(a)-c*ny*sin(a))+state.az)/(2*pi);
                optics[q+2]=.03*pow(7/r,1.5);
                optics[q+3]=max(0,min(gas.h-1,Math.floor(log(r/6)/log(7)*gas.h)))*gas.w;
            }
        }
    }
    return {fps:10,software:true,draw(state,width,height){
        const w=min(width,660),h=Math.round(height*w/width);
        const camera=[w,h,state.incl,state.az,state.zoom,state.lens,state.centerX,state.centerY].join('/');
        if(key!==camera){geometry(state,w,h);key=camera;}
        const exposure=pow(2,state.ev);
        for(let i=0;i<w*h;i++){
            const p=i*5,o=i*4;
            let e=bg[p+3];
            for(let j=0;j<3;j++){
                const q=i*12+j*4;
                if(!optics[q])continue;
                const lon=optics[q+1]-state.clock*optics[q+2];
                const g=gas.pixels[(optics[q+3]+Math.floor((lon-Math.floor(lon))*gas.w))*4]/255;
                e+=optics[q]*exp((g-.5)*2.8);
            }
            e*=exposure;const t=exp(-2*e),halo=bg[p+4];
            frame.data[o]=255*(bg[p]*t+1-exp(-1.52*e)+halo);
            frame.data[o+1]=255*(bg[p+1]*t+1-exp(-.72*e)+halo*.49);
            frame.data[o+2]=255*(bg[p+2]*t+1-exp(-.34*e)+halo*.28);
            frame.data[o+3]=255;
        }
        ctx.putImageData(frame,0,0);
    }};
}
