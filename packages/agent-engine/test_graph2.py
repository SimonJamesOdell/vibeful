import sys
sys.path.insert(0, 'src')
from agent_graph import build_agent_graph, AgentState
import asyncio, traceback

async def main():
    print('Building graph...')
    graph = build_agent_graph()
    print('Graph compiled.')
    state = AgentState(session_id='test', user_message='Hello', system_prompt='Be brief.', model='deepseek-chat', temperature=0.7)
    print('Invoking...')
    try:
        result = await graph.ainvoke(state)
        print('SUCCESS!')
        for chunk in result.response_chunks:
            s = chunk.get('state','?')
            t = chunk.get('text_chunk','')
            u = chunk.get('usage','')
            print(f'  [{s}] {t}{u}')
    except Exception as e:
        print(f'ERROR: {e}')
        traceback.print_exc()

asyncio.run(main())
