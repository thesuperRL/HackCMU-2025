from sqlalchemy import create_engine, text, select, insert, update, MetaData, Table, exists
import sqlalchemy
from sqlalchemy.orm import sessionmaker
import pandas as pd

DATABASE_URL = "postgresql://neondb_owner:npg_IynsOvqCp54B@ep-solitary-waterfall-aeaz3n0s-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
metadata = MetaData()

accounts = Table("maps", metadata, autoload_with=engine)

df = pd.read_csv('lanternflydata.csv')

for index, row in df.iterrows():
    insert_stmt = insert(accounts).values(
        name = row['Name'],
        longitude = row['Longitude'],
        latitude = row['Latitude'], 
        image_link = row['Image'],
        date = row['Date'],
    )

    with engine.begin() as conn:
        conn.execute(insert_stmt)
        print(f"Inserted row {index} with name: {row['Name']}")