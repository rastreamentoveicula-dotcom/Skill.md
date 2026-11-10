#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera os PNGs da Biblioteca de Elementos (public/elements/). Estilo glass/neon."""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'elements')
os.makedirs(OUT, exist_ok=True)
CYAN=(0,240,255); MAG=(255,46,147); BLUE=(2,132,199); GOLD=(255,196,64); WHITE=(248,250,252)

def canvas(w,h): return Image.new('RGBA',(w,h),(0,0,0,0))

def vgrad(w,h,top,bottom):
    t=np.linspace(0,1,h)[:,None]
    arr=np.zeros((h,w,4),dtype=np.uint8)
    for c in range(3):
        arr[...,c]=(top[c]+(bottom[c]-top[c])*t).astype(np.uint8)
    arr[...,3]=255
    return Image.fromarray(arr,'RGBA')

def rounded_mask(w,h,r):
    m=Image.new('L',(w,h),0); d=ImageDraw.Draw(m)
    d.rounded_rectangle([0,0,w-1,h-1],radius=r,fill=255); return m

def shadowed(base,shape,blur=18,offset=(0,14),alpha=110):
    sh=Image.new('RGBA',base.size,(0,0,0,0))
    sh.paste(Image.new('RGBA',shape.size,(8,10,20,alpha)),(offset[0],offset[1]),shape)
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))

def glass_panel(w,h,r,top=(255,255,255,235),bottom=(205,222,240,190)):
    img=vgrad(w,h,top[:3],bottom[:3])
    img.putalpha(rounded_mask(w,h,r))
    d=ImageDraw.Draw(img)
    d.rounded_rectangle([1,1,w-2,h-2],radius=r,outline=(255,255,255,200),width=3)
    return img

def neon_glow(img,color,blur=16,alpha=150):
    glow=Image.new('RGBA',img.size,(0,0,0,0))
    solid=Image.new('RGBA',img.size,color+(alpha,))
    glow.paste(solid,(0,0),img)
    return glow.filter(ImageFilter.GaussianBlur(blur))

def add_glow(base,img,color,blur=16,alpha=150):
    base.alpha_composite(neon_glow(img,color,blur,alpha))

# ---------- dispositivos ----------
def phone():
    w,h=420,860; out=canvas(w,h)
    body=rounded_mask(w,h,58); shadowed(out,body,22,(0,18),120)
    img=vgrad(w,h,(30,38,58),(12,16,26)); img.putalpha(body)
    d=ImageDraw.Draw(img)
    scr=rounded_mask(w-40,h-40,42); screen=vgrad(w-40,h-40,(14,26,42),(8,12,22)); screen.putalpha(scr)
    img.alpha_composite(screen,(20,20))
    dd=ImageDraw.Draw(img)
    for i in range(5):
        y=180+i*110; dd.line([(60,y),(w-60,y-40+(i%2)*60)],fill=CYAN+(70,),width=6)
    for x,y in [(120,300),(300,420),(160,560),(290,660)]:
        dd.ellipse([x-10,y-10,x+10,y+10],fill=CYAN+(200,))
    dd.rounded_rectangle([w/2-70,26,w/2+70,52],radius=13,fill=(8,12,22,255))
    d.rounded_rectangle([2,2,w-4,h-4],radius=56,outline=(140,190,255,150),width=4)
    out.alpha_composite(img); add_glow(out,body,CYAN,22,90); return out

def tablet():
    w,h=720,540; out=canvas(w,h)
    body=rounded_mask(w,h,42); shadowed(out,body,20,(0,16),115)
    img=vgrad(w,h,(238,244,252),(198,214,234)); img.putalpha(body)
    scr=rounded_mask(w-48,h-48,30); screen=vgrad(w-48,h-48,(20,32,52),(10,16,28)); screen.putalpha(scr)
    img.alpha_composite(screen,(24,24))
    d=ImageDraw.Draw(img)
    for i in range(4):
        x=70+i*150; d.rounded_rectangle([x,300,x+110,420],radius=16,fill=(0,240,255,60+i*25))
    d.ellipse([320,120,400,200],fill=(255,46,147,180))
    out.alpha_composite(img); return out

def watch():
    w,h=320,420; out=canvas(w,h)
    band=rounded_mask(120,h,40); b=vgrad(120,h,(60,72,96),(28,36,54)); b.putalpha(band)
    out.alpha_composite(b,(100,0))
    body=rounded_mask(240,300,60); shadowed(out,body,16,(0,12),110)
    img=vgrad(240,300,(26,34,52),(12,16,26)); img.putalpha(body)
    d=ImageDraw.Draw(img)
    d.ellipse([40,40,200,200],outline=CYAN+(220,),width=10)
    d.line([(120,120),(120,70)],fill=WHITE+(255,),width=10)
    d.line([(120,120),(160,150)],fill=MAG+(255,),width=8)
    out.alpha_composite(img,(40,60)); add_glow(out,body,CYAN,14,80); return out

# ---------- segurança ----------
def shield():
    w,h=520,600; out=canvas(w,h)
    pts=[(w/2,20),(w-40,110),(w-40,320),(w/2,h-20),(40,320),(40,110)]
    m=Image.new('L',(w,h),0); ImageDraw.Draw(m).polygon(pts,fill=255)
    m=m.filter(ImageFilter.GaussianBlur(1))
    shadowed(out,m,22,(0,16),120)
    img=vgrad(w,h,(235,250,255),(150,210,240)); img.putalpha(m)
    d=ImageDraw.Draw(img)
    d.polygon([(w/2-90,300),(w/2-20,380),(w/2+110,230)],outline=CYAN+(255,),width=26)
    d.line([(w/2-90,300),(w/2-20,380)],fill=CYAN+(255,),width=26,joint='curve')
    d.line([(w/2-20,380),(w/2+110,230)],fill=CYAN+(255,),width=26,joint='curve')
    out.alpha_composite(img); add_glow(out,m,CYAN,20,140); return out

def padlock():
    w,h=420,480; out=canvas(w,h)
    d0=ImageDraw.Draw(out)
    arc=Image.new('RGBA',(w,h),(0,0,0,0)); da=ImageDraw.Draw(arc)
    da.arc([90,20,330,300],180,360,fill=(190,220,255,255),width=42)
    add_glow(out,arc,BLUE,12,90); out.alpha_composite(arc)
    body=rounded_mask(340,260,50); shadowed(out,body,18,(0,14),115)
    img=vgrad(340,260,(240,248,255),(170,205,238)); img.putalpha(body)
    d=ImageDraw.Draw(img)
    d.ellipse([135,70,205,140],fill=BLUE+(255,))
    d.rounded_rectangle([158,120,182,190],radius=12,fill=BLUE+(255,))
    out.alpha_composite(img,(40,210)); add_glow(out,body,BLUE,16,90); return out

def bell():
    w,h=460,480; out=canvas(w,h)
    m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
    d.pieslice([70,60,390,380],180,360,fill=GOLD+(255,))
    d.rounded_rectangle([70,220,390,340],radius=30,fill=GOLD+(255,))
    d.ellipse([190,330,270,410],fill=(255,150,40,255))
    d.ellipse([210,20,250,70],fill=GOLD+(255,))
    shadowed(out,m,16,(0,12),110); add_glow(out,m,GOLD,18,110); out.alpha_composite(m); return out

# ---------- veículos ----------
def car():
    w,h=760,420; out=canvas(w,h)
    m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
    d.rounded_rectangle([60,190,700,320],radius=60,fill=(235,242,252,255))
    d.pieslice([190,60,580,320],180,360,fill=(225,236,250,255))
    d.rounded_rectangle([240,95,360,190],radius=24,fill=(60,110,180,255))
    d.rounded_rectangle([400,95,530,190],radius=24,fill=(60,110,180,255))
    shadowed(out,m,18,(0,16),120); out.alpha_composite(m)
    for cx in (210,550):
        d.ellipse([cx-72,248,cx+72,392],fill=(20,26,40,255))
        d.ellipse([cx-44,276,cx+44,364],fill=(210,225,245,255))
        d.ellipse([cx-18,302,cx+18,338],fill=(80,120,190,255))
    dd=ImageDraw.Draw(out)
    dd.line([(90,300),(670,300)],fill=CYAN+(160,),width=6)
    add_glow(out,m,MAG,22,80); return out

def map_pin():
    w,h=360,520; out=canvas(w,h)
    m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
    d.ellipse([40,20,320,300],fill=MAG+(255,))
    d.polygon([(70,230),(290,230),(180,500)],fill=MAG+(255,))
    d.ellipse([115,95,245,225],fill=(255,255,255,255))
    d.ellipse([150,130,210,190],fill=MAG+(255,))
    shadowed(out,m,16,(0,14),115); add_glow(out,m,MAG,18,130); out.alpha_composite(m); return out

def route():
    w,h=600,420; out=canvas(w,h)
    m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
    for i in range(9):
        x=60+i*58; y=300-140*math.sin(i/8*math.pi)
        d.ellipse([x-16,y-16,x+16,y+16],fill=CYAN+(220,))
    d.ellipse([40,270,100,330],fill=CYAN+(255,)); d.ellipse([25,255,115,345],outline=CYAN+(255,),width=10)
    d.ellipse([500,180,560,240],fill=MAG+(255,)); d.ellipse([485,165,575,255],outline=MAG+(255,),width=10)
    shadowed(out,m,12,(0,10),90); add_glow(out,m,CYAN,14,110); out.alpha_composite(m); return out

# ---------- negócios ----------
def card():
    w,h=640,400; out=canvas(w,h)
    body=rounded_mask(w,h,44); shadowed(out,body,20,(0,16),120)
    g=vgrad(w,h,(255,120,190),(120,90,240))
    mask=body; g.putalpha(mask); out.alpha_composite(g)
    d=ImageDraw.Draw(out)
    d.rounded_rectangle([60,140,140,210],radius=14,fill=(255,220,120,255))
    for i in range(3): d.line([(60,260+i*30),(320-i*40,260+i*30)],fill=(255,255,255,180),width=12)
    d.ellipse([w-190,220,w-70,340],fill=(255,255,255,120))
    d.ellipse([w-260,220,w-140,340],fill=(255,255,255,90))
    return out

def chart():
    w,h=520,440; out=canvas(w,h)
    base=glass_panel(w,h,36); shadowed(out,rounded_mask(w,h,36),18,(0,14),110); out.alpha_composite(base)
    d=ImageDraw.Draw(out)
    for i,(hh,col) in enumerate([(120,BLUE),(200,CYAN),(150,MAG),(260,GOLD)]):
        x=70+i*110
        d.rounded_rectangle([x,360-hh,x+70,360],radius=18,fill=col+(230,))
    d.line([(50,380),(470,380)],fill=(90,110,150,200),width=6)
    return out

def coins():
    w,h=440,420; out=canvas(w,h)
    for i,(x,y,r) in enumerate([(120,240,110),(250,180,110),(320,300,95)]):
        m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
        d.ellipse([x-r,y-r,x+r,y+r],fill=GOLD+(255,))
        d.ellipse([x-r+22,y-r+22,x+r-22,y+r-22],outline=(255,240,190,255),width=12)
        shadowed(out,m,12,(0,10),100); add_glow(out,m,GOLD,12,70); out.alpha_composite(m)
    return out

# ---------- UI ----------
def button_pill():
    w,h=640,220; out=canvas(w,h)
    body=rounded_mask(w-20,h-20,90); shadowed(out,body,16,(0,12),110)
    img=vgrad(w-20,h-20,(255,255,255),(210,230,250)); img.putalpha(body)
    d=ImageDraw.Draw(img)
    d.rounded_rectangle([2,2,w-22,h-22],radius=88,outline=CYAN+(255,),width=6)
    d.ellipse([60,70,120,130],fill=CYAN+(255,))
    out.alpha_composite(img,(10,10)); add_glow(out,body,CYAN,18,110); return out

def notification():
    w,h=640,360; out=canvas(w,h)
    body=rounded_mask(w,h,42); shadowed(out,body,18,(0,14),115)
    img=glass_panel(w,h,42)
    d=ImageDraw.Draw(img)
    d.ellipse([40,60,130,150],fill=MAG+(255,))
    d.rounded_rectangle([170,70,430,110],radius=20,fill=(70,90,130,220))
    d.rounded_rectangle([170,130,520,165],radius=16,fill=(120,140,180,160))
    d.ellipse([w-90,40,w-40,90],fill=(255,60,90,255))
    out.alpha_composite(img); add_glow(out,body,MAG,16,80); return out

def cursor():
    w,h=320,400; out=canvas(w,h)
    m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
    d.polygon([(60,30),(60,320),(130,240),(180,350),(230,325),(180,220),(280,215)],fill=(255,255,255,255),outline=(30,40,70,255))
    for rr,alpha in [(120,90),(170,55),(220,30)]:
        d.ellipse([200-rr//2,320-rr//2,200+rr//2,320+rr//2],outline=CYAN+(alpha,),width=8)
    shadowed(out,m,10,(0,8),90); out.alpha_composite(m); return out

def check_circle():
    w,h=420,420; out=canvas(w,h)
    m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
    d.ellipse([30,30,390,390],fill=(235,252,255,255))
    d.ellipse([30,30,390,390],outline=CYAN+(255,),width=16)
    d.line([(120,220),(190,290)],fill=CYAN+(255,),width=30)
    d.line([(190,290),(310,150)],fill=CYAN+(255,),width=30)
    shadowed(out,m,14,(0,12),110); add_glow(out,m,CYAN,16,120); out.alpha_composite(m); return out

# ---------- grafismos ----------
def ring():
    w,h=560,560; out=canvas(w,h)
    m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
    for i in range(26):
        a0=i*360/26; col=CYAN if i%2==0 else MAG
        d.arc([40,40,w-40,h-40],a0,a0+360/26+4,fill=col+(230,),width=34)
    shadowed(out,m,14,(0,12),90); add_glow(out,m,CYAN,20,110); out.alpha_composite(m); return out

def burst():
    w,h=720,720; out=canvas(w,h)
    m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
    cols=[CYAN,MAG,BLUE,GOLD]
    for i in range(16):
        a=i*math.pi/8
        x2=w/2+math.cos(a)*w*0.55; y2=h/2+math.sin(a)*h*0.55
        x1=w/2+math.cos(a+0.12)*40; y1=h/2+math.sin(a+0.12)*40
        x3=w/2+math.cos(a-0.12)*40; y3=h/2+math.sin(a-0.12)*40
        d.polygon([(x1,y1),(x2,y2),(x3,y3)],fill=cols[i%4]+(120,))
    out.alpha_composite(m.filter(ImageFilter.GaussianBlur(3))); return out

def sparkle():
    w,h=360,360; out=canvas(w,h)
    m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
    def star(cx,cy,r,col):
        pts=[]
        for k in range(8):
            a=k*math.pi/4; rr=r if k%2==0 else r*0.22
            pts.append((cx+math.cos(a)*rr,cy+math.sin(a)*rr))
        d.polygon(pts,fill=col+(255,))
    star(180,180,150,CYAN); star(300,80,52,MAG); star(80,290,44,WHITE)
    shadowed(out,m,8,(0,6),80); add_glow(out,m,CYAN,14,120); out.alpha_composite(m); return out

def hexgrid():
    w,h=620,560; out=canvas(w,h)
    m=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(m)
    r=68
    for row in range(5):
        for col in range(5):
            cx=90+col*118+(59 if row%2 else 0); cy=80+row*102
            pts=[(cx+math.cos(math.pi/6+ k*math.pi/3)*r, cy+math.sin(math.pi/6+k*math.pi/3)*r) for k in range(6)]
            d.polygon(pts,outline=CYAN+(120,))
            d.polygon(pts,outline=CYAN+(60,))
    out.alpha_composite(m); return out

ELEMENTS={'phone':phone,'tablet':tablet,'watch':watch,'shield':shield,'padlock':padlock,'bell':bell,
 'car':car,'map-pin':map_pin,'route':route,'card':card,'chart':chart,'coins':coins,
 'button-pill':button_pill,'notification':notification,'cursor':cursor,'check-circle':check_circle,
 'ring':ring,'burst':burst,'sparkle':sparkle,'hexgrid':hexgrid}

for name,fn in ELEMENTS.items():
    img=fn(); img.save(os.path.join(OUT,name+'.png')); print(name+'.png', img.size)

# ---------- fundos ----------
def bg_neon_grid():
    w,h=1080,1920
    a=np.zeros((h,w,3),dtype=np.float32); a[:,:]= (11,14,20)
    yy,xx=np.mgrid[0:h,0:w]
    glow=np.exp(-(((xx-w*0.5)**2+(yy-h*0.42)**2)/(2*(w*0.55)**2)))
    a[...,0]+=glow*22; a[...,1]+=glow*48; a[...,2]+=glow*70
    img=Image.fromarray(a.astype(np.uint8)); d=ImageDraw.Draw(img)
    for i in range(26):
        y=int(h*0.32+i*i*3.1); d.line([(0,y),(w,y)],fill=(0,240,255,26),width=2)
    for i in range(20):
        x0=w/2+(i-10)*40; d.line([(w/2,h*0.3),(x0*3-w,h)],fill=(0,240,255,20),width=2)
    d.ellipse([w*0.18,h*0.24,w*0.82,h*0.60],outline=(255,46,147,50),width=6)
    d.ellipse([w*0.28,h*0.28,w*0.72,h*0.54],outline=(0,240,255,42),width=4)
    return img.filter(ImageFilter.GaussianBlur(1.2))

def bg_light_studio():
    w,h=1080,1920
    a=np.zeros((h,w,3),dtype=np.float32); a[:,:]=(248,250,252)
    yy,xx=np.mgrid[0:h,0:w]
    g=np.exp(-(((xx-w*0.5)**2+(yy-h*0.42)**2)/(2*(w*0.62)**2)))
    a[...,0]-=g*22; a[...,1]-=g*10; a[...,2]+=g*6
    return Image.fromarray(np.clip(a,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))

def bg_dark_glow():
    w,h=1080,1920
    a=np.zeros((h,w,3),dtype=np.float32); a[:,:]=(9,12,20)
    yy,xx=np.mgrid[0:h,0:w]
    g1=np.exp(-(((xx-w*0.25)**2+(yy-h*0.3)**2)/(2*(w*0.5)**2)))
    g2=np.exp(-(((xx-w*0.8)**2+(yy-h*0.75)**2)/(2*(w*0.5)**2)))
    a[...,0]+=g1*18+g2*60; a[...,1]+=g1*70+g2*16; a[...,2]+=g1*95+g2*90
    return Image.fromarray(np.clip(a,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))

def bg_mesh():
    w,h=1080,1920
    a=np.zeros((h,w,3),dtype=np.float32); a[:,:]=(255,255,255)
    yy,xx=np.mgrid[0:h,0:w]
    for cx,cy,col,s in [(0.2,0.2,(255,60,140),0.55),(0.85,0.3,(255,190,60),0.5),(0.25,0.85,(80,120,255),0.6),(0.8,0.8,(150,80,255),0.5),(0.5,0.5,(255,255,255),0.35)]:
        g=np.exp(-(((xx-w*cx)**2+(yy-h*cy)**2)/(2*(w*s)**2)))[...,None]
        a=a*(1-g*0.55)+np.array(col,dtype=np.float32)*(g*0.55)
    return Image.fromarray(np.clip(a,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))

for name,fn in [('bg-neon-grid',bg_neon_grid),('bg-light-studio',bg_light_studio),('bg-dark-glow',bg_dark_glow),('bg-mesh',bg_mesh)]:
    fn().convert('RGB').save(os.path.join(OUT,name+'.jpg'),quality=86); print(name+'.jpg 1080x1920')
print('OK')
