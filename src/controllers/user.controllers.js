import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken =  user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

         user.refreshToken = refreshToken
         await user.save({ validateBeforeSave: false })

         return {accessToken,refreshToken}

    } catch (error) {
       throw new ApiError(500,"something went wrong while generating refresh and access token") 
    }
}

const registerUser = asyncHandler( async (req,res)=>{
    
    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res

  const {fullName,email,username,password} = req.body
//   console.log("email: ",email);

//   if(fullName === ""){
//       throw new ApiError(400,"fullname is required")
//   }

if(
    [fullName,email,username,password].some((field)=> 
    field?.trim() === "")
){
    throw new ApiError(400,"All fields are required")
}

const existedUser = await User.findOne({
    $or:[{ username },{ email }]
})

if (existedUser) {
    throw new ApiError(409,"User with email or username already exist")
}

// console.log(req.files)

const avatarLocalPath = req.files?.avatar[0]?.path;
// const coverImageLocalPath = req.files?.coverImage?.[0]?.path || null;  this is the first solution


let coverImageLocalPath;
if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
    coverImageLocalPath = req.files.coverImage[0].path
}

if (!avatarLocalPath) {
    throw new ApiError(400,"Avatar file is required")
}

const avatar = await uploadOnCloudinary(avatarLocalPath)
const coverImage = await uploadOnCloudinary(coverImageLocalPath)

// console.log(avatar);

if (!avatar) {
   throw new ApiError(400,"Avatar file is required")
}

const user = await User.create({
    fullName,
    avatar:avatar.url,
    coverImage:coverImage?.url || "",
    email,
    password,
    username:username.toLowerCase()
})

// console.log(user);


const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
)

// console.log(createdUser);

if (!createdUser) {
  throw new ApiError (500,"something went wrong while registering the user")   
}

return res.status(201).json(
    new ApiResponse(200,createdUser,"User register successfully")
)

} )

const loginUser = asyncHandler(async (req,res) =>{
   // req body -> data
   // username or email
   // find the user
   // password check
   // access and refresh token
   //send cookie

   const { email,username,password } = req.body
   console.log(email);

   if (!username && !email) {
       throw new ApiError(400,"username or email is required")
    }

    // Here is an alternative of above code base on logic discussed in video: if you have need only one then use this 
    // if(!(username || email)){
    //     throw new ApiError(400,"username or email is required")
    // }

   const user = await User.findOne({
        $or:[{username},{email}]
    })

    if (!user) {
       throw new ApiError(400,"User does not exist") 
    }

   const isPasswordValid =  await user.isPasswordCorrect(password)

   if (!isPasswordValid) {
    throw new ApiError(401,"Invalid user credentials") 
 }

 const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id)

 const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

 const option = {
    httpOnly : true,
    secure: true
 }

 return res
 .status(200)
 .cookie("accessToken",accessToken,option)
 .cookie("refreshToken",refreshToken,option)
 .json(
    new ApiResponse(
        200,
        {
            user: loggedInUser,accessToken,
            refreshToken
        },
        "User logged In Successfully"
    )
 )

})

const logoutUser = asyncHandler(async (req,res)=>{
    await User.findByIdAndUpdate(
    req.user._id,
    {
        $set:{
            refreshToken: undefined
        }
    },
    {
        new:true
    }
)

   const option = {
    httpOnly : true,
    secure: true
   }

   return res
   .status(200)
   .clearCookie("accessToken",option)
   .clearCookie("accessToken",option)
   .json(new ApiResponse(200,{},"User logged Out"))
})

const refreshAccessToken = asyncHandler(async (req,res)=> {
   const incomingRefreshToken =  req.cookie.refreshToken || req.body.refreshToken

   if(!incomingRefreshToken){
       throw new ApiError(401,"unauthorized request")
   }

   try {
    const decodedToken = jwt.verify(
     incomingRefreshToken,
     process.env.REFRESH_TOKEN_SECRET
    )
 
    const user = await User.findById(decodedToken?._id)
 
    if(!user){
        throw new ApiError(401,"Invalid refresh Token")
    }
 
    if (incomingRefreshToken !== user?.refreshToken) {
       throw new ApiError(401,"Refresh token is expired or used")
    }
 
    const option = {
     httpOnly:true,
     secure:true
    }
 
    const {accessToken,newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
 
    return res
    .status(200)
    .cookie("accessToken",accessToken,option)
    .cookie("refreshToken",newRefreshToken,option)
    .json(
     new ApiResponse(
         200,
         {accessToken,refreshToken:newRefreshToken},
         "Access token refreshed"
     )
    )
   } catch (error) {
      throw new ApiError(401,error?.message || "Invalid refresh token")
   }

} )

const changeCurrentUserPassword = asyncHandler(async(req,res)=>{
    const {oldPassword,newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
       throw new ApiError(400,"Invalid old password") 
    }

    user.password = newPassword
    await user.save({validateBeforeSave:false})
 
    return res
    .status(200)
    .json(new ApiResponse(200,{},"Password change successfully"))
})

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res
    .status(200)
    .json(new ApiResponse(
        200,
        req.user,
        "current user fetched successfully"
    ))
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName,email} = req.body

    if (!fullName || !email) {
       throw new ApiError(400,"All fields are required") 
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullName,
                email
            }
        },
        {new:true}

    
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,user,"Account details updated successfully"))

})

const updateUserAvatar = asyncHandler(async (req,res)=>{
    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath){
        throw new ApiError(400,"Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url || !avatar.public_id){
        throw new ApiError(400,"Error while uploading on avatar")
    }

    if(req.user?.avatarId){
        await cloudinary.uploader.destroy(req.user.avatarId).catch((err)=>{
            console.error("Failed to delete old avatar:",err.message);
        })
    }
      
   const user  =  await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar:avatar.url,
                avatarId:avatar.public_id
            }
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200,user,"avatar Image Updated successfully")
    )


})

const updateUserCoverImage = asyncHandler(async (req,res)=>{
    const  coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath){
        throw new ApiError(400,"coverImage file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url || !coverImage.public_id){
        throw new ApiError(400,"Error while uploading on coverImage")
    }

    if(req.user?.coverImageId){
        await cloudinary.uploader.destroy(req.user.coverImageId).catch((err)=>{
            console.error("Failed to delete old coverImage:",err.message);
        })
    }
      
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage:coverImage.url,
                coverImageId:coverImage.public_id
            }
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200,user,"Cover Image Updated successfully")
    )


})

const getUserChannelProfile = asyncHandler(async (req,res)=>{
     const {username} = req.params

     if (!username?.trim()) {
        throw new ApiError(400,"username is missing")
     }

    const channel = await User.aggregate([
        {
            $match:{
                username: username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount:{
                   $size:"$subscribers"
                },
                channelsSubscribedToCount:{
                    $size: "$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if : {$in:[req.user?._id,"$subscribers.subscriber"]},
                        then:true,
                        else:false                                                                   
                    }                                               
                }
            }
        },
        {
            $project:{
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1

            }
        }
    ])

    if (!channel?.length) {
        throw new ApiError(400,"channel does not exists")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200,channel[0],"User channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async (req,res)=>{
    const user = await User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from:"video",
                localField:"watchHistory",
                foreignField:"_id",
                as:"watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner",
                            pipeline:[
                                {
                                    $project:{
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first:"$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(200,user[0].watchHistory,"Watch history fetched successfully")
    )
})
 
export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentUserPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}                                                                                     