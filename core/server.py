#!/usr/bin/env python3
import asyncio
import json
import logging
import os
import time
import uuid
from typing import Dict, Set

import websockets
from websockets.server import WebSocketServerProtocol

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PORT = int(os.environ.get('PORT', 5082))
HEARTBEAT_INTERVAL = 30
HEARTBEAT_TIMEOUT = 60

rooms: Dict[str, Set[str]] = {}
clients: Dict[str, dict] = {}
users_info: Dict[str, Dict[str, dict]] = {}  # room_id -> {user_id -> user_info}


async def cleanup_user(user_id: str):
    """清理断开连接时的用户数据"""
    client = clients.get(user_id)
    if not client:
        return
    
    room_id = client.get('room_id')
    if room_id and room_id in rooms:
        rooms[room_id].discard(user_id)
        
        # 移除用户信息
        if room_id in users_info and user_id in users_info[room_id]:
            del users_info[room_id][user_id]
        
        # 通知其他用户
        await broadcast(room_id, {
            'type': 'user-left',
            'userId': user_id
        }, exclude_user=user_id)
        
        # 广播更新后的用户列表
        await broadcast_user_list(room_id)
        
        # 移除空房间
        if not rooms[room_id]:
            del rooms[room_id]
            if room_id in users_info:
                del users_info[room_id]
    
    # 关闭WebSocket连接（如果仍然打开）
    ws = client.get('ws')
    if ws and not ws.closed:
        await ws.close()
    
    # 移除客户端
    if user_id in clients:
        del clients[user_id]


async def broadcast(room_id: str, message: dict, exclude_user: str = None):
    """向房间内所有用户广播消息"""
    if room_id not in rooms:
        return
    
    message_str = json.dumps(message)
    
    for user_id in rooms[room_id]:
        if user_id != exclude_user:
            client = clients.get(user_id)
            if client and client['ws'] and not client['ws'].closed:
                try:
                    await client['ws'].send(message_str)
                except Exception as e:
                    logger.error(f"Error sending to {user_id}: {e}")


async def broadcast_user_list(room_id: str):
    """向房间内所有用户广播更新后的用户列表"""
    if room_id not in rooms:
        return
    
    users_list = users_info.get(room_id, {})
    await broadcast(room_id, {
        'type': 'user-list',
        'users': users_list
    })


async def handle_message(ws: WebSocketServerProtocol, user_id: str, message: dict):
    """处理传入的WebSocket消息"""
    msg_type = message.get('type')
    
    if msg_type == 'join':
        # 离开当前房间（如果有）
        if clients[user_id]['room_id']:
            await cleanup_user(user_id)
            clients[user_id] = {'ws': ws, 'room_id': None, 'last_heartbeat': time.time()}
        
        room_id = message.get('room')
        user_info = message.get('userInfo', {'name': f'用户{user_id[:4]}', 'avatar': '#999'})
        
        clients[user_id]['room_id'] = room_id
        
        # 如果房间不存在则创建
        if room_id not in rooms:
            rooms[room_id] = set()
        if room_id not in users_info:
            users_info[room_id] = {}
        
        rooms[room_id].add(user_id)
        users_info[room_id][user_id] = user_info
        
        # 发送加入确认和用户信息
        await ws.send(json.dumps({
            'type': 'joined',
            'userId': user_id,
            'userInfo': user_info,
            'users': list(rooms[room_id]),
            'usersInfo': users_info[room_id]
        }))
        
        # 通知其他用户并带有用户信息
        await broadcast(room_id, {
            'type': 'user-joined',
            'userId': user_id,
            'userInfo': user_info
        }, exclude_user=user_id)
        
        # 广播更新后的用户列表
        await broadcast_user_list(room_id)
    
    elif msg_type in ['offer', 'answer', 'ice-candidate']:
        target = message.get('target')
        if target and target in clients:
            target_ws = clients[target]['ws']
            if target_ws and not target_ws.closed:
                await target_ws.send(json.dumps({
                    'type': msg_type,
                    'from': user_id,
                    'data': message.get('data')
                }))
    
    elif msg_type == 'heartbeat':
        await ws.send(json.dumps({'type': 'heartbeat-ack'}))


async def handle_connection(ws: WebSocketServerProtocol, path: str):
    """处理新的WebSocket连接"""
    # 生成更友好的用户ID
    user_id = f"user_{int(time.time() * 1000) % 1000000}"
    clients[user_id] = {
        'ws': ws,
        'room_id': None,
        'last_heartbeat': time.time()
    }
    
    try:
        async for message in ws:
            try:
                data = json.loads(message)
                clients[user_id]['last_heartbeat'] = time.time()
                await handle_message(ws, user_id, data)
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON from {user_id}")
            except Exception as e:
                logger.error(f"Error handling message from {user_id}: {e}")
    
    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        logger.error(f"Connection error for {user_id}: {e}")
    finally:
        await cleanup_user(user_id)


async def cleanup_inactive_users():
    """定期清理不活跃的用户"""
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        current_time = time.time()
        
        users_to_cleanup = []
        for user_id, client in clients.items():
            if current_time - client['last_heartbeat'] > HEARTBEAT_TIMEOUT:
                users_to_cleanup.append(user_id)
        
        for user_id in users_to_cleanup:
            logger.info(f"Cleaning up inactive user: {user_id}")
            await cleanup_user(user_id)


async def main():
    """启动WebSocket服务器"""
    logger.info(f"Starting signaling server on port {PORT}")
    
    # 启动清理任务
    asyncio.create_task(cleanup_inactive_users())
    
    # 启动WebSocket服务器
    async with websockets.serve(handle_connection, "0.0.0.0", PORT):
        await asyncio.Future()  # 永久运行


if __name__ == "__main__":
    asyncio.run(main())