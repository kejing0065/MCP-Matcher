import asyncio
from services.fx import fetch_rate
async def main():
    try:
        # try latest instead of date
        import httpx
        url = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            print("Latest:", resp.status_code)
    except Exception as e:
        print(e)
if __name__ == "__main__":
    asyncio.run(main())
