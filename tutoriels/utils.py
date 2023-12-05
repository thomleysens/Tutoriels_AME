# -*- coding: utf-8 -*-
"""
@author: thomleysens
"""

import requests
import pandas as pd
import yaml
from collections import namedtuple


def get_wiki_url(
    wikidata_id,
    base_url="https://www.wikidata.org/wiki/Special:EntityData/{}.json",
    wiki="frwiki"
):
    """
    Get wikipedia url from wikidata ID

    Parameters
    ----------
    wikidata_id (str): Wikidata ID
    base_url (str): Url to request Entity and get JSON response
                    Default: "https://www.wikidata.org/wiki/Special:EntityData/{}.json
    wiki (str): Wiki reference
                Default: "frwiki"

    Returns
    -------
    url (str):
        - Wikipedia URL if wikidata_id is not NA
        - None if wikidata_id is NA
    """
    if pd.isna(wikidata_id) is False:
        url = requests.get(
            base_url.format(wikidata_id)
        ).json()["entities"][wikidata_id]["sitelinks"][wiki]["url"]
    else:
        url = None

    return url


def load_params(filepath):
    """
    Load parameters from local or remote
    YAML file

    Parameters
    ----------
    filepath (str): URL or path to local file
                    File (local or remote) needs 
                    to be structured like this:
                    ranges:
                        x: [-284221, -277648]
                        y: [5987515, 5992714]
                    buffer_value: 200
                    csv:
                        file: "game_QA.csv"
                        sep: ";" 
                    nb_questions: 5
    Return
    ------
    params (namedtuple)
    """
    Params = namedtuple(
        "Params",
        [
            "ranges",
            "buffer_value",
            "nb_q",
            "csv_sep",
            "csv_file"
        ]
    )
    #Cheap way to check if url
    #(better methods exist but we keep it simple)
    if filepath.lower().startswith(
        ("http://", "https://")
    ):
        content = yaml.safe_load(
            requests.get(filepath).content
        )
    else:
        with open(filepath, "r") as file:
            content = yaml.load(
                file,
                Loader=yaml.FullLoader,
            )

    params = Params(
        content["ranges"],
        content["buffer_value"],
        content["nb_questions"],
        content["csv"]["sep"],
        content["csv"]["file"]
    )

    return params