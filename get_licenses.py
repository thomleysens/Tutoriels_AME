# -*- coding: utf-8 -*-
"""
@author: thomleysens
"""

import glob
import json
import pandas as pd
import argparse
import yaml

def get_licenses(env_dir, pip_libs=""):
    """
    env_dirs (str): env conda-meta dir 
    """
    columns = [
    	"name",
    	"version",
    	"channel",
    	"license",
    	"url"
    ]
    data = []
    for file in glob.glob(env_dir+"*.json"):
        with open(file) as json_data:
            data.append(
            	pd.DataFrame(
            		pd.json_normalize(
            			json.load(json_data)
            		)
            	)
            )
    df = pd.concat(data)
    if pip_libs != "":
	    with open(pip_libs, "r") as parameters:
		    libs = pd.DataFrame(
			yaml.load(
			    parameters,
			    Loader=yaml.FullLoader
			)
		    ).T.reset_index().rename(
			columns={
			    "index":"name"
			}
		    )
		    df = pd.concat(
	     		[df, libs]
	     	    )
    df.dropna(
    	subset=["license"],
    	inplace=True
    )
    df.sort_values(
    	by=["name"],
    	inplace=True
    )
            
    return df[columns]
			
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Get License of each conda env library"
        )
    parser.add_argument(
        "env_dir",
        type=str,
        help="Environment directory"
    )
    parser.add_argument(
        "output",
        type=str,
        help="Path to .md output file"
    )
    parser.add_argument(
        "pip_lib_yaml",
        type=str,
        help="Path to YAML pip installed libs"
    )
    args = parser.parse_args()
    df = get_licenses(
        args.env_dir,
        args.pip_lib_yaml
    )
    
    with open(args.output, "w") as output:
        output.write(
             df.to_markdown(
                 index=False
             )
        )