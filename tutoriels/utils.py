# -*- coding: utf-8 -*-
"""
@author: thomleysens
"""

import requests
import pandas as pd


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