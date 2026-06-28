import asyncio
import traceback
from vibeful_agent_engine.agent_graph import build_agent_graph, AgentState

async def main():
    print("Building graph...")
    graph = build_agent_graph()
    print("Graph compiled.")

    state = AgentState(
        session_id="test",
        user_message="Hello",
        system_prompt="You are helpful. Be brief.",
        model="deepseek-chat",
        temperature=0.7,
    )

    print("Invoking...")
    try:
        result = await graph.ainvoke(state)
        for chunk in result.response_chunks:
            state_name = chunk.get("state", "?")
            text = chunk.get("text_chunk", "")
            usage = chunk.get("usage", "")
            print(f"[{state_name}] {text}{usage}")
        print("SUCCESS!")
    except Exception as e:
        print(f"ERROR: {e}")
        traceback.print_exc()

asyncio.run(main())
