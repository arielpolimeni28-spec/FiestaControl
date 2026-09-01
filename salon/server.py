import json, os, sqlite3, socket, threading, time, webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path

BASE=Path(__file__).resolve().parent
DB=BASE/'fiestacontrol.db'
PORT=int(os.environ.get('PORT', os.environ.get('FIESTACONTROL_PORT','8080')))
SEED={
 'salons':[],
 'admins':[{'id':'adm1','name':'Administrador General','email':'admin@fiestacontrol.com','password':'admin123'}],
 'events':[],'staff':[],'assignments':[],'suppliers':[],'orders':[],'cards':[],
 'communityPosts':[],'marketSuppliers':[],'servicePayments':[],
 'settings':{'supportWhatsApp':'','paymentLink':''}
}
LOCK=threading.Lock()

def db_connect():
    c=sqlite3.connect(DB, timeout=15)
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, updated REAL NOT NULL)')
    row=c.execute('SELECT data FROM app_state WHERE id=1').fetchone()
    if not row:
        c.execute('INSERT INTO app_state(id,data,updated) VALUES(1,?,?)',(json.dumps(SEED,ensure_ascii=False),time.time()))
        c.commit()
    return c

def get_state():
    with LOCK:
        c=db_connect(); row=c.execute('SELECT data FROM app_state WHERE id=1').fetchone(); c.close()
        return json.loads(row[0]) if row else SEED

def put_state(obj):
    # Validación mínima para evitar guardar cualquier tipo de contenido accidental.
    if not isinstance(obj,dict) or 'salons' not in obj or 'admins' not in obj:
        raise ValueError('Estado inválido')
    raw=json.dumps(obj,ensure_ascii=False,separators=(',',':'))
    with LOCK:
        c=db_connect(); c.execute('UPDATE app_state SET data=?,updated=? WHERE id=1',(raw,time.time())); c.commit(); c.close()


def register_entity(kind, payload):
    if kind not in ('salon','provider'):
        raise ValueError('Tipo de registro inválido')
    if not isinstance(payload, dict):
        raise ValueError('Datos inválidos')
    email=str(payload.get('email','')).strip().lower()
    if not email:
        raise ValueError('Email requerido')
    with LOCK:
        c=db_connect()
        row=c.execute('SELECT data FROM app_state WHERE id=1').fetchone()
        st=json.loads(row[0]) if row else json.loads(json.dumps(SEED))
        if kind=='salon':
            arr=st.setdefault('salons',[])
            if any(str(x.get('email','')).strip().lower()==email for x in arr):
                c.close(); raise ValueError('Ese email ya está registrado')
            item={
                'id':payload.get('id') or ('sal_'+str(int(time.time()*1000))),
                'name':str(payload.get('name','')).strip(),
                'owner':str(payload.get('owner','')).strip(),
                'phone':str(payload.get('phone','')).strip(),
                'address':str(payload.get('address','')).strip(),
                'zone':str(payload.get('zone','')).strip(),
                'email':email,
                'password':str(payload.get('password','')),
                'status':'Pendiente','plan':'Inicial',
                'created':time.strftime('%Y-%m-%d'),
                'brandColor':'#7257ff','logo':'','publicAvailabilityEnabled':False,
                'publicProfileEnabled':True,'publicAddressVisible':True,'publicPhoneVisible':True,
                'publicDescription':'','publicServices':'','publicCapacity':'','publicInstagram':'',
                'publicGallery':[]
            }
            if not item['name'] or not item['owner'] or not item['address'] or not item['zone'] or not item['password']:
                c.close(); raise ValueError('Faltan datos obligatorios')
            arr.append(item)
        else:
            arr=st.setdefault('marketSuppliers',[])
            if any(str(x.get('email','')).strip().lower()==email for x in arr):
                c.close(); raise ValueError('Ese email ya está registrado')
            item={
                'id':payload.get('id') or ('prov_'+str(int(time.time()*1000))),
                'business':str(payload.get('business','')).strip(),
                'owner':str(payload.get('owner','')).strip(),
                'category':str(payload.get('category','')).strip(),
                'phone':str(payload.get('phone','')).strip(),
                'email':email,
                'description':str(payload.get('description','')).strip(),
                'password':str(payload.get('password','')),
                'status':'Pendiente','created':time.strftime('%Y-%m-%d'),'products':[]
            }
            if not item['business'] or not item['owner'] or not item['category'] or not item['phone'] or not item['password']:
                c.close(); raise ValueError('Faltan datos obligatorios')
            arr.append(item)
        raw=json.dumps(st,ensure_ascii=False,separators=(',',':'))
        c.execute('UPDATE app_state SET data=?,updated=? WHERE id=1',(raw,time.time()))
        c.commit(); c.close()
        return item, st


def marketplace_action(action, payload):
    if not isinstance(payload, dict):
        raise ValueError('Datos inválidos')
    with LOCK:
        c=db_connect()
        row=c.execute('SELECT data FROM app_state WHERE id=1').fetchone()
        st=json.loads(row[0]) if row else json.loads(json.dumps(SEED))
        orders=st.setdefault('orders',[])
        salons=st.setdefault('salons',[])
        providers=st.setdefault('marketSuppliers',[])
        now=time.strftime('%Y-%m-%dT%H:%M:%S')
        if action=='create_order':
            salon_id=str(payload.get('salonId',''))
            provider_id=str(payload.get('marketSupplierId',''))
            salon=next((x for x in salons if x.get('id')==salon_id and x.get('status')=='Aprobado'),None)
            provider=next((x for x in providers if x.get('id')==provider_id and x.get('status')=='Aprobado'),None)
            if not salon or not provider: raise ValueError('Salón o proveedor no habilitado')
            order={
                'id':payload.get('id') or ('ord_'+str(int(time.time()*1000))),
                'salonId':salon_id,'source':'market','marketSupplierId':provider_id,
                'productId':str(payload.get('productId','')),'eventId':str(payload.get('eventId','')),
                'detail':str(payload.get('detail','')).strip(),'amount':float(payload.get('amount') or 0),
                'status':'Pendiente','createdAt':payload.get('createdAt') or now,
                'deliveryDate':'','paymentTerms':'A coordinar','paymentStatus':'Pendiente',
                'providerUnread':True,'salonUnread':False,
                'messages':[{'id':'msg_'+str(int(time.time()*1000)),'by':'salon',
                             'text':str(payload.get('message') or ('Nuevo pedido: '+str(payload.get('detail','')))),
                             'at':payload.get('createdAt') or now}]
            }
            orders.append(order)
        elif action=='send_message':
            oid=str(payload.get('orderId','')); by=str(payload.get('by',''))
            if by not in ('salon','provider'): raise ValueError('Emisor inválido')
            order=next((x for x in orders if x.get('id')==oid),None)
            if not order: raise ValueError('Pedido inexistente')
            text=str(payload.get('text','')).strip()
            if not text: raise ValueError('Mensaje vacío')
            order.setdefault('messages',[]).append({'id':'msg_'+str(int(time.time()*1000)),'by':by,'text':text,'at':now})
            if by=='salon':
                order['providerUnread']=True; order['salonUnread']=False
            else:
                order['salonUnread']=True; order['providerUnread']=False
        elif action=='provider_update':
            oid=str(payload.get('orderId',''))
            order=next((x for x in orders if x.get('id')==oid),None)
            if not order: raise ValueError('Pedido inexistente')
            order['status']=str(payload.get('status') or order.get('status','Pendiente'))
            order['deliveryDate']=str(payload.get('deliveryDate') or '')
            order['paymentTerms']=str(payload.get('paymentTerms') or 'A coordinar')
            order['paymentStatus']=str(payload.get('paymentStatus') or 'Pendiente')
            msg=str(payload.get('message','')).strip()
            if msg:
                order.setdefault('messages',[]).append({'id':'msg_'+str(int(time.time()*1000)),'by':'provider','text':msg,'at':now})
            order['salonUnread']=True; order['providerUnread']=False
        elif action=='mark_read':
            oid=str(payload.get('orderId','')); side=str(payload.get('side',''))
            order=next((x for x in orders if x.get('id')==oid),None)
            if not order: raise ValueError('Pedido inexistente')
            if side=='salon': order['salonUnread']=False
            elif side=='provider': order['providerUnread']=False
        else:
            raise ValueError('Acción inválida')
        raw=json.dumps(st,ensure_ascii=False,separators=(',',':'))
        c.execute('UPDATE app_state SET data=?,updated=? WHERE id=1',(raw,time.time()))
        c.commit(); c.close()
        return st

def local_ip():
    try:
        s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); ip=s.getsockname()[0]; s.close(); return ip
    except Exception:
        return '127.0.0.1'

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(BASE),**kwargs)
    def log_message(self,fmt,*args):
        print('[FiestaControl]',fmt%args)
    def no_cache(self):
        self.send_header('Cache-Control','no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma','no-cache')
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/api/status':
            st=get_state()
            payload={'ok':True,'server':socket.gethostname(),'db':str(DB),'salons':len(st.get('salons',[])),'providers':len(st.get('marketSuppliers',[])),'time':time.time()}
            raw=json.dumps(payload,ensure_ascii=False).encode('utf-8')
            self.send_response(200); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.no_cache(); self.end_headers(); self.wfile.write(raw); return
        if path=='/api/data':
            raw=json.dumps(get_state(),ensure_ascii=False).encode('utf-8')
            self.send_response(200); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.no_cache(); self.end_headers(); self.wfile.write(raw); return
        if path=='/api/bootstrap.js':
            state=json.dumps(get_state(),ensure_ascii=False).replace('</','<\/')
            forwarded_host=(self.headers.get('X-Forwarded-Host') or '').split(',')[0].strip()
            host=forwarded_host or (self.headers.get('Host') or '')
            forwarded_proto=(self.headers.get('X-Forwarded-Proto') or '').split(',')[0].strip()
            proto=forwarded_proto or 'http'
            host_name=host.split(':')[0].lower() if host else ''
            if host_name in ('127.0.0.1','localhost','::1') or not host:
                host=f'{local_ip()}:{PORT}'
                proto='http'
            public_base=f'{proto}://{host}'
            raw=("window.__FC_SERVER_MODE__=true;window.__FC_PUBLIC_BASE_URL__="+json.dumps(public_base)+";window.__FC_SERVER_DATA__="+state+";").encode('utf-8')
            self.send_response(200); self.send_header('Content-Type','application/javascript; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.no_cache(); self.end_headers(); self.wfile.write(raw); return
        return super().do_GET()
    def do_POST(self):
        path=urlparse(self.path).path
        try:
            n=int(self.headers.get('Content-Length','0'))
            body=self.rfile.read(n)
            req=json.loads(body.decode('utf-8'))
            if path=='/api/register':
                item, st=register_entity(req.get('kind'), req.get('data') or {})
                payload={'ok':True,'item':item,'state':st}; code=201
            elif path=='/api/marketplace':
                st=marketplace_action(req.get('action'), req.get('data') or {})
                payload={'ok':True,'state':st}; code=200
            else:
                self.send_error(404); return
            raw=json.dumps(payload,ensure_ascii=False).encode('utf-8')
            self.send_response(code); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.no_cache(); self.end_headers(); self.wfile.write(raw)
        except Exception as e:
            raw=json.dumps({'ok':False,'error':str(e)},ensure_ascii=False).encode('utf-8')
            self.send_response(400); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.no_cache(); self.end_headers(); self.wfile.write(raw)

    def do_PUT(self):
        path=urlparse(self.path).path
        if path!='/api/data': self.send_error(404); return
        try:
            n=int(self.headers.get('Content-Length','0'))
            body=self.rfile.read(n)
            obj=json.loads(body.decode('utf-8'))
            put_state(obj)
            raw=b'{"ok":true}'
            self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(raw))); self.no_cache(); self.end_headers(); self.wfile.write(raw)
        except Exception as e:
            raw=json.dumps({'ok':False,'error':str(e)}).encode('utf-8')
            self.send_response(400); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)

if __name__=='__main__':
    db_connect().close()
    ip=local_ip()
    print('\n'+'='*62)
    print(' FIESTACONTROL - SERVIDOR CENTRAL')
    print('='*62)
    print(f' En esta PC:   http://127.0.0.1:{PORT}')
    print(f' Desde la red: http://{ip}:{PORT}')
    print(' Base central: '+str(DB))
    print(' Dejá esta ventana abierta mientras usás FiestaControl.')
    print('='*62+'\n')
    try:
        webbrowser.open(f'http://127.0.0.1:{PORT}')
    except Exception: pass
    try:
        ThreadingHTTPServer(('0.0.0.0',PORT),Handler).serve_forever()
    except KeyboardInterrupt:
        print('\nServidor detenido.')
